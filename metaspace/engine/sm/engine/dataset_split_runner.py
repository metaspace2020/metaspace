"""Database-aware orchestration for splitting a dataset along its ROIs.

The pure file-level logic lives in :mod:`sm.engine.dataset_split`; this module knows about the
``dataset_split_job`` / ``dataset_split_child`` tables, S3 and the dataset queues.

Flow: sm-graphql has already created the ``graphql.dataset`` rows, resolved the project and
consumed quota, and recorded one ``dataset_split_child`` row per ROI carrying the dataset doc.
This module writes each child's raw files and only then calls ``SMapiDatasetManager.add`` so that
annotation never starts before the files exist. Children are processed independently, so one
failing ROI does not take the rest of the split down with it.
"""

from __future__ import annotations

import json
import logging
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

from pyimzml.ImzMLParser import ImzMLParser

from sm.engine import image_storage
from sm.engine.config import SMConfig
from sm.engine.dataset_split import (
    ChildSpec,
    CoalescingRangeReader,
    DatasetSplitError,
    crop_optical_image,
    parse_input_path,
    plan_child,
    read_parent_format,
    s3_range_fetcher,
    write_child_imzml,
)
from sm.engine.postprocessing.experiment_masks import rasterise_roi_mask
from sm.engine.storage import get_s3_client
from sm.engine.utils.dataset_image_data import get_tic_image

logger = logging.getLogger('engine')

# ROIs smaller than this cannot produce usable annotations — chaos and spatial metrics have no
# structure to measure and FDR is estimated from too few surviving annotations — so they are
# refused outright. Between the two thresholds the UI warns but lets the user proceed.
MIN_ROI_PIXELS = 500
WARN_ROI_PIXELS = 2000


class SplitJobStatus:
    QUEUED = 'QUEUED'
    STARTED = 'STARTED'
    FILES_DONE = 'FILES_DONE'
    FINISHED = 'FINISHED'
    FAILED = 'FAILED'


class SplitChildStatus:
    PENDING = 'PENDING'
    ANNOTATING = 'ANNOTATING'
    FINISHED = 'FINISHED'
    FAILED = 'FAILED'


TERMINAL_CHILD_STATUSES = (SplitChildStatus.FINISHED, SplitChildStatus.FAILED)

SEL_JOB = '''
    SELECT id, parent_ds_id, parent_ds_name, user_id, submitter_email, project_id, status
    FROM dataset_split_job WHERE id = %s
'''
SEL_CHILDREN = '''
    SELECT id, child_ds_id, roi_id, roi_name, roi_geojson, doc, status
    FROM dataset_split_child WHERE job_id = %s AND status = %s ORDER BY id
'''


def roi_pixel_counts(db, ds_id: str, roi_ids: Optional[List[int]] = None) -> List[Dict[str, Any]]:
    """Count the pixels each ROI of a dataset covers, for the split dialog's size guard.

    Uses the stored TIC image as the sample-area mask, which is the same grid ROI polygons are
    drawn on, so these counts match what the split job will actually select.
    """
    query = 'SELECT id, name, is_default, geojson FROM roi WHERE dataset_id = %s'
    params: Tuple = (ds_id,)
    if roi_ids:
        query += ' AND id = ANY(%s)'
        params = (ds_id, list(roi_ids))
    rois = db.select(query, params=params)
    if not rois:
        return []

    tic_image = get_tic_image(db, image_storage, ds_id)
    height, width = tic_image.shape
    has_data = np.nan_to_num(tic_image, nan=0.0) > 0

    counts = []
    for roi_id, name, is_default, geojson in rois:
        if isinstance(geojson, str):
            geojson = json.loads(geojson)
        mask = rasterise_roi_mask(geojson, roi_id, width, height)
        n_pixels = int(np.count_nonzero(has_data & (mask > 0))) if mask is not None else 0
        counts.append(
            {
                'roi_id': roi_id,
                'name': name,
                'is_default': is_default,
                'n_pixels': n_pixels,
                'blocked': n_pixels < MIN_ROI_PIXELS,
                'warning': MIN_ROI_PIXELS <= n_pixels < WARN_ROI_PIXELS,
            }
        )
    return counts


def _update_job(db, job_id, status, error=None):
    db.alter(
        'UPDATE dataset_split_job SET status = %s, error = %s, updated_at = NOW() WHERE id = %s',
        params=(status, error, job_id),
    )


def _update_child(db, child_id, status, error=None, crop_origin=None, n_pixels=None):
    db.alter(
        '''UPDATE dataset_split_child
           SET status = %s, error = %s,
               crop_origin = COALESCE(%s, crop_origin),
               n_pixels = COALESCE(%s, n_pixels)
           WHERE id = %s''',
        params=(
            status,
            error,
            json.dumps(crop_origin) if crop_origin else None,
            n_pixels,
            child_id,
        ),
    )


def _upload_child_files(s3_client, bucket: str, uuid: str, files, base_name: str) -> None:
    for path, suffix in ((files.imzml_path, 'imzML'), (files.ibd_path, 'ibd')):
        s3_client.upload_file(str(path), bucket, f'{uuid}/{base_name}.{suffix}')
    logger.info(f'Uploaded child files to s3://{bucket}/{uuid}/')


def run_split_job(db, ds_man, job_id: int, use_lithops: bool = False) -> Dict[str, Any]:
    """Write every PENDING child's raw files and submit each for annotation.

    Only children still in PENDING are (re)processed — this is what makes it safe to call this
    both for a job's first run (every child starts PENDING) and to restart a job left mid-flight
    by a daemon crash, without re-running (and thereby corrupting) children already annotating or
    finished.

    Returns a summary of per-child outcomes. Raises only if the job itself cannot start (e.g. the
    parent's files are unreadable); individual child failures are recorded and reported.
    """
    job = db.select_one(SEL_JOB, params=(job_id,))
    if not job:
        raise DatasetSplitError(f'Split job {job_id} does not exist')
    _, parent_ds_id, parent_ds_name, _, submitter_email, _, _ = job

    children = db.select(SEL_CHILDREN, params=(job_id, SplitChildStatus.PENDING))
    if not children:
        total = db.select_one(
            'SELECT COUNT(*) FROM dataset_split_child WHERE job_id = %s', params=(job_id,)
        )
        if not total or total[0] == 0:
            raise DatasetSplitError(f'Split job {job_id} has no children')
        # Every child already left PENDING in an earlier run (e.g. a restart after the daemon
        # crashed just past the last child) — nothing left to do.
        logger.info(f'Split job {job_id} has no PENDING children left to process')
        _update_job(db, job_id, SplitJobStatus.FILES_DONE)
        return {'job_id': job_id, 'children': []}

    _update_job(db, job_id, SplitJobStatus.STARTED)
    logger.info(f'Splitting dataset {parent_ds_id} into {len(children)} children (job {job_id})')

    results = _write_all_children(db, ds_man, parent_ds_id, children, use_lithops, submitter_email)

    _update_job(db, job_id, SplitJobStatus.FILES_DONE)
    n_failed = sum(1 for r in results if not r['ok'])
    logger.info(
        f'Split job {job_id} prepared {len(results) - n_failed}/{len(results)} children'
        f' for "{parent_ds_name}"'
    )
    return {'job_id': job_id, 'children': results}


def _write_all_children(
    db, ds_man, parent_ds_id, children, use_lithops, submitter_email
) -> List[Dict[str, Any]]:
    """Parse the parent once, then write and submit each child from it."""
    s3_client, bucket, imzml_key, ibd_key = _locate_parent_files(db, parent_ds_id)

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        local_imzml = tmp_path / 'parent.imzML'
        # Only the XML is downloaded; the ibd is read through ranged requests per child.
        s3_client.download_file(bucket, imzml_key, str(local_imzml))
        parser = ImzMLParser(str(local_imzml), ibd_file=None)
        fmt = read_parent_format(parser)
        # The parent's coordinate list is invariant across every child — convert it once here
        # rather than inside each child's processing, which used to redo it twice per child.
        coords_xy = np.array(parser.coordinates)[:, :2]

        return [
            _process_child(
                db=db,
                ds_man=ds_man,
                child=child,
                parser=parser,
                coords_xy=coords_xy,
                fmt=fmt,
                s3_client=s3_client,
                bucket=bucket,
                ibd_key=ibd_key,
                tmp_path=tmp_path,
                use_lithops=use_lithops,
                submitter_email=submitter_email,
            )
            for child in children
        ]


def _locate_parent_files(db, parent_ds_id: str):
    """Resolve the parent's upload bucket and its imzML/ibd object keys."""
    parent = db.select_one('SELECT input_path FROM dataset WHERE id = %s', params=(parent_ds_id,))
    if not parent or not parent[0]:
        raise DatasetSplitError(f'Parent dataset {parent_ds_id} has no input path')

    bucket, uuid = parse_input_path(parent[0])
    s3_client = get_s3_client(sm_config=SMConfig.get_conf())
    imzml_key, ibd_key = _find_parent_keys(s3_client, bucket, uuid)
    return s3_client, bucket, imzml_key, ibd_key


def _find_parent_keys(s3_client, bucket: str, uuid: str) -> Tuple[str, str]:
    """Locate the parent's imzML and ibd object keys under its upload prefix."""
    listing = s3_client.list_objects(Bucket=bucket, Prefix=uuid).get('Contents', [])
    imzml_key = next((o['Key'] for o in listing if o['Key'].lower().endswith('.imzml')), None)
    ibd_key = next((o['Key'] for o in listing if o['Key'].lower().endswith('.ibd')), None)
    if not imzml_key or not ibd_key:
        raise DatasetSplitError(f'Could not find imzML/ibd files under s3://{bucket}/{uuid}')
    return imzml_key, ibd_key


def _process_child(  # pylint: disable=too-many-arguments,too-many-locals
    db,
    ds_man,
    child,
    parser,
    coords_xy,
    fmt,
    s3_client,
    bucket,
    ibd_key,
    tmp_path,
    use_lithops,
    submitter_email,
):
    """Write and submit one child; record and swallow its failure so siblings still run."""
    child_id, child_ds_id, roi_id, roi_name, roi_geojson, doc, _ = child
    if isinstance(roi_geojson, str):
        roi_geojson = json.loads(roi_geojson)
    if isinstance(doc, str):
        doc = json.loads(doc)

    try:
        spec: ChildSpec = plan_child(coords_xy, roi_geojson, roi_id, roi_name)
        if spec.n_pixels < MIN_ROI_PIXELS:
            raise DatasetSplitError(
                f'ROI "{roi_name}" covers {spec.n_pixels} pixels, below the {MIN_ROI_PIXELS} '
                f'pixel minimum for a usable dataset'
            )

        out_path = tmp_path / child_ds_id
        reader = CoalescingRangeReader(s3_range_fetcher(s3_client, bucket, ibd_key))
        files = write_child_imzml(parser, coords_xy, reader, spec, fmt, out_path)

        # The child's own input path decides where its files go — it need not share the parent's
        # bucket, since sm-graphql allocates it from its own upload configuration.
        child_bucket, child_uuid = parse_input_path(doc['input_path'])
        _upload_child_files(s3_client, child_bucket, child_uuid, files, child_ds_id)
        # Free this child's local files now rather than at the end of the whole job — otherwise
        # peak disk usage is the sum of every child's files instead of just the largest one.
        files.imzml_path.unlink(missing_ok=True)
        files.ibd_path.unlink(missing_ok=True)

        doc['size_hash'] = {'imzml_size': files.imzml_size, 'ibd_size': files.ibd_size}
        _update_child(
            db,
            child_id,
            SplitChildStatus.ANNOTATING,
            crop_origin={'x0': spec.crop_origin[0], 'y0': spec.crop_origin[1]},
            n_pixels=spec.n_pixels,
        )
        db.alter(
            'UPDATE dataset_split_child SET doc = %s WHERE id = %s',
            params=(json.dumps(doc), child_id),
        )
        # The submitter's email rides along exactly like a normal dataset submission, so this
        # child's own finish/fail email fires the same way any other dataset's would.
        ds_man.add(doc, use_lithops=use_lithops, email=submitter_email)
        return {'child_ds_id': child_ds_id, 'roi_name': roi_name, 'ok': True, 'error': None}
    except Exception as e:  # pylint: disable=broad-except
        logger.exception(f'Failed to prepare split child "{roi_name}" ({child_ds_id})')
        _update_child(db, child_id, SplitChildStatus.FAILED, error=str(e))
        return {'child_ds_id': child_ds_id, 'roi_name': roi_name, 'ok': False, 'error': str(e)}


def find_child(db, ds_id: str) -> Optional[Dict[str, Any]]:
    """Return the split-child row for a dataset, or None if it wasn't produced by a split."""
    row = db.select_one(
        '''SELECT c.id, c.job_id, c.child_ds_id, c.roi_name, c.crop_origin, j.parent_ds_id
           FROM dataset_split_child c JOIN dataset_split_job j ON j.id = c.job_id
           WHERE c.child_ds_id = %s''',
        params=(ds_id,),
    )
    if not row:
        return None
    crop_origin = row[4]
    if isinstance(crop_origin, str):
        crop_origin = json.loads(crop_origin)
    return {
        'id': row[0],
        'job_id': row[1],
        'child_ds_id': row[2],
        'roi_name': row[3],
        'crop_origin': crop_origin,
        'parent_ds_id': row[5],
    }


def attach_optical_image(db, ds_man, child: Dict[str, Any]) -> bool:
    """Give a freshly annotated child a copy of its parent's optical image, cropped to its region.

    Must run after annotation: ``sm.engine.optical_image`` derives the child's ion-image
    dimensions by reading one of its annotation images, which do not exist until then.
    """
    parent_ds_id, crop_origin = child['parent_ds_id'], child['crop_origin']
    if not parent_ds_id or not crop_origin:
        return False

    parent = db.select_one(
        'SELECT optical_image, transform FROM dataset WHERE id = %s', params=(parent_ds_id,)
    )
    if not parent or not parent[0] or not parent[1]:
        return False
    raw_img_id, transform = parent

    child_ds_id = child['child_ds_id']
    width, height = _child_ion_image_size(db, child_ds_id)
    raw_bytes = image_storage.get_image(image_storage.RAW, parent_ds_id, raw_img_id)
    cropped, child_transform = crop_optical_image(
        Image.open(BytesIO(raw_bytes)),
        transform,
        width,
        height,
        (crop_origin['x0'], crop_origin['y0']),
    )

    buffer = BytesIO()
    cropped.save(buffer, format='PNG')
    child_img_id = image_storage.post_image(image_storage.RAW, child_ds_id, buffer.getvalue())
    ds_man.add_optical_image(child_ds_id, child_img_id, child_transform)
    logger.info(f'Attached cropped optical image to split child {child_ds_id}')
    return True


def _child_ion_image_size(db, ds_id: str) -> Tuple[int, int]:
    """The child's ion-image dimensions, from its stored TIC image."""
    tic_image = get_tic_image(db, image_storage, ds_id)
    height, width = tic_image.shape
    return width, height


def mark_child_terminal(db, ds_id: str, status: str, error: str = None) -> None:
    """Record a child's final state, and flip the job to FINISHED once every child is terminal.

    Each child now emails its own submitter on finish/fail exactly like a normal dataset, so
    unlike the original design this no longer needs to build or report a job-wide summary — it
    only keeps the bookkeeping other things still rely on: per-child status (used by the restart
    path to avoid reprocessing children that already ran) and the job's own terminal status.
    """
    child = find_child(db, ds_id)
    if child is None:
        return

    db.alter(
        'UPDATE dataset_split_child SET status = %s, error = COALESCE(%s, error) WHERE id = %s',
        params=(status, error, child['id']),
    )

    job_id = child['job_id']
    pending = db.select_one(
        '''SELECT COUNT(*) FROM dataset_split_child
           WHERE job_id = %s AND status NOT IN %s''',
        params=(job_id, TERMINAL_CHILD_STATUSES),
    )
    if pending and pending[0] > 0:
        return

    _update_job(db, job_id, SplitJobStatus.FINISHED)
