"""Migrate pre-upgrade segmentation jobs to the per-user segmentation model.

One-off admin script for the per-user segmentation rollout. Run it once on prod,
after the migration that added the new ``image_segmentation_job`` columns and
before deploying the new engine/graphql/webapp, which read only the job row and
carry no fallback for legacy data:

    python scripts/migrate_segmentation_jobs.py            # dry run, prints what would change
    python scripts/migrate_segmentation_jobs.py --apply    # writes

Phase 1, owners: jobs with ``user_id IS NULL`` whose dataset has a submitter get
that submitter as owner. Jobs whose dataset has no ``graphql.dataset`` row, or
whose submitter is unknown, are listed and left alone.

Phase 2, results: for every job with ``result IS NULL AND label_map_image_id IS NULL``,
the dataset's legacy SEGMENTATION ``dataset_diagnostic`` row (``job_id IS NULL``)
is copied onto the latest FINISHED default job of that dataset (``result`` from
its ``data``, the label-map columns from its LABEL_MAP image), then that
diagnostic row is deleted. The image itself is kept: the job now owns it.
Other jobs of the dataset are not the diagnostic's and are listed and left
alone, as are jobs whose dataset has no legacy diagnostic.
"""
import argparse
import json
import logging
from typing import Dict, List, Optional

from sm.engine.db import DB, transaction_context
from sm.engine.util import GlobalInit

logger = logging.getLogger('engine')

ASSIGNABLE_SEL = """
SELECT j.id, j.ds_id, d.user_id
FROM public.image_segmentation_job j
JOIN graphql.dataset d ON d.id = j.ds_id
WHERE j.user_id IS NULL AND d.user_id IS NOT NULL
ORDER BY j.id
"""

UNASSIGNABLE_SEL = """
SELECT j.id, j.ds_id
FROM public.image_segmentation_job j
LEFT JOIN graphql.dataset d ON d.id = j.ds_id
WHERE j.user_id IS NULL AND d.user_id IS NULL
ORDER BY j.id
"""

ASSIGN_UPD = """
UPDATE public.image_segmentation_job j
SET user_id = d.user_id
FROM graphql.dataset d
WHERE d.id = j.ds_id AND j.user_id IS NULL AND d.user_id IS NOT NULL
"""

RESULTLESS_SEL = """
SELECT id, ds_id
FROM public.image_segmentation_job
WHERE result IS NULL AND label_map_image_id IS NULL
ORDER BY ds_id, id
"""

LATEST_DEFAULT_SEL = """
SELECT id
FROM public.image_segmentation_job
WHERE ds_id = %s AND is_default = true AND status = 'FINISHED'
ORDER BY created_at DESC, id DESC
LIMIT 1
"""

LEGACY_DIAGNOSTIC_SEL = """
SELECT id, data, images
FROM public.dataset_diagnostic
WHERE ds_id = %s AND type = 'SEGMENTATION' AND job_id IS NULL
"""

RESULT_UPD = """
UPDATE public.image_segmentation_job
SET result = %s::jsonb, label_map_image_id = %s, label_map_image_url = %s
WHERE id = %s AND result IS NULL AND label_map_image_id IS NULL
RETURNING id
"""

DIAGNOSTIC_DEL = 'DELETE FROM public.dataset_diagnostic WHERE id = %s'


def assign_owners(db: DB, apply: bool) -> int:
    """Report (and with ``apply`` write) the owner of every ownerless job.

    Returns the number of jobs that were, or would be, updated.
    """
    assignable = db.select(ASSIGNABLE_SEL)
    unassignable = db.select(UNASSIGNABLE_SEL)

    for job_id, ds_id, user_id in assignable:
        logger.info(f'job {job_id} (dataset {ds_id}) -> user {user_id}')
    for job_id, ds_id in unassignable:
        logger.warning(f'job {job_id} (dataset {ds_id}) has no known submitter; left unowned')

    if not assignable:
        logger.info('Nothing to assign')
        return 0

    if apply:
        db.alter(ASSIGN_UPD)
        logger.info(f'Assigned owners to {len(assignable)} segmentation jobs')
    else:
        logger.info(f'Dry run: {len(assignable)} segmentation jobs would be updated (use --apply)')
    return len(assignable)


def _label_map_image(images: Optional[List[Dict]]) -> Optional[Dict]:
    """Return the LABEL_MAP entry of a diagnostic's ``images`` array, or None."""
    for img in images or []:
        if img.get('key') == 'LABEL_MAP':
            return img
    return None


def _migrate_dataset_result(db: DB, ds_id: str, job_ids: List[int], apply: bool) -> int:
    """Copy one dataset's legacy diagnostic onto its latest FINISHED default job.

    Returns 1 when that job was (or would be) updated, else 0.
    """
    latest = db.select_one(LATEST_DEFAULT_SEL, (ds_id,))
    target_id = latest[0] if latest else None
    for job_id in job_ids:
        if job_id != target_id:
            logger.info(
                f'job {job_id} (dataset {ds_id}) is not the latest FINISHED default job; left'
            )
    if target_id not in job_ids:
        return 0

    diagnostics = db.select_with_fields(LEGACY_DIAGNOSTIC_SEL, (ds_id,))
    if not diagnostics:
        logger.warning(f'job {target_id} (dataset {ds_id}) has no legacy diagnostic; left')
        return 0
    if len(diagnostics) > 1:
        logger.warning(
            f'dataset {ds_id} has {len(diagnostics)} legacy SEGMENTATION diagnostics; '
            f'job {target_id} left'
        )
        return 0
    diag = diagnostics[0]
    image = _label_map_image(diag['images'])
    if diag['data'] is None or image is None or not image.get('image_id'):
        logger.warning(
            f'legacy diagnostic {diag["id"]} of dataset {ds_id} has no result or usable LABEL_MAP '
            f'image; job {target_id} left'
        )
        return 0

    logger.info(
        f'job {target_id} (dataset {ds_id}) <- result of diagnostic {diag["id"]}, '
        f'label map {image.get("image_id")} ({image.get("url")}); then delete diagnostic row'
    )
    if apply:
        with transaction_context():
            updated = db.select_one(
                RESULT_UPD,
                params=(
                    json.dumps(diag['data']),
                    image.get('image_id'),
                    image.get('url'),
                    target_id,
                ),
            )
            if not updated:
                logger.warning(
                    f'job {target_id} (dataset {ds_id}) was not updated; '
                    f'diagnostic {diag["id"]} kept'
                )
                return 0
            db.alter(DIAGNOSTIC_DEL, params=(diag['id'],))
    return 1


def migrate_results(db: DB, apply: bool) -> int:
    """Report (and with ``apply`` write) the legacy result of every resultless job.

    Returns the number of jobs that were, or would be, updated.
    """
    jobs_by_ds: Dict[str, List[int]] = {}
    for job_id, ds_id in db.select(RESULTLESS_SEL):
        jobs_by_ds.setdefault(ds_id, []).append(job_id)

    if not jobs_by_ds:
        logger.info('No job without a result')
        return 0

    migrated = sum(
        _migrate_dataset_result(db, ds_id, job_ids, apply) for ds_id, job_ids in jobs_by_ds.items()
    )
    total = sum(len(job_ids) for job_ids in jobs_by_ds.values())
    if apply:
        logger.info(f'Copied legacy results to {migrated} of {total} resultless segmentation jobs')
    else:
        logger.info(
            f'Dry run: {migrated} of {total} resultless segmentation jobs would get the legacy '
            'result (use --apply)'
        )
    return migrated


def parse_args():
    parser = argparse.ArgumentParser(
        description='Give pre-upgrade segmentation jobs an owner and their legacy result'
    )
    parser.add_argument('--config', default='conf/config.json', help='SM config path')
    parser.add_argument(
        '--apply', action='store_true', help='Write the changes (default is a dry run)'
    )
    return parser.parse_args()


def main():
    args = parse_args()
    with GlobalInit(args.config):
        db = DB()
        owners = assign_owners(db, apply=args.apply)
        results = migrate_results(db, apply=args.apply)
        verb = 'updated' if args.apply else 'would be updated'
        logger.info(f'Owners: {owners} jobs {verb}; results: {results} jobs {verb}')


if __name__ == '__main__':
    main()
