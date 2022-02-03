import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from threading import Lock

from metaspace.sm_annotation_utils import SMInstance

from sm.engine.annotation.diagnostics import get_dataset_diagnostics, DiagnosticType
from sm.engine.annotation_lithops.annotation_job import ServerAnnotationJob
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.config import SMConfig
from sm.engine.dataset import Dataset, DatasetStatus
from sm.engine.db import DB
from sm.engine.utils.perf_profile import perf_profile

logger = logging.getLogger('ml-scoring')
submit_mutex = Lock()


def reprocess_dataset_local(
    sm_src, src_ds_id, dst_ds_id, update_metadata_func, skip_existing=True, use_cache=False
):
    existing = get_dataset_diagnostics(dst_ds_id)
    if skip_existing and existing:
        print(f'Skipping {dst_ds_id}\n', end=None)
        return dst_ds_id, None

    smds = sm_src.dataset(id=src_ds_id)
    db = DB()
    ds_metadata, ds_config = update_metadata_func(smds.metadata, smds.config)

    ds = Dataset(
        id=dst_ds_id,
        name=smds.name,
        input_path=smds.s3dir,
        upload_dt=datetime.now(),
        metadata=ds_metadata,
        config=ds_config,
        status=DatasetStatus.QUEUED,
        status_update_dt=None,
        is_public=False,
    )
    ds.save(db, None, True)
    with perf_profile(db, 'annotate_lithops', dst_ds_id) as perf:
        executor = Executor(SMConfig.get_conf()['lithops'], perf=perf)
        job = ServerAnnotationJob(executor, ds, perf, use_cache=use_cache)
        job.pipe.use_db_cache = False
        job.run()
    return dst_ds_id


def reprocess_many_datasets_local(sm_src, src_ds_ids, dst_ds_ids, skip_existing=True):
    def run(args):
        src_ds_id, dst_ds_id = args
        try:
            return reprocess_dataset_local(sm_src, src_ds_id, dst_ds_id, skip_existing), None
        except Exception as e:
            return dst_ds_id, e

    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(run, zip(src_ds_ids, dst_ds_ids)))

    succeeded = [r[0] for r in results if r[1] is None]
    failed = [r for r in results if r[1] is not None]

    print(f'{len(succeeded)} succeeded: {", ".join(succeeded)}')
    if failed:
        print(f'{len(failed)} failed:')
        for f in failed:
            print(f'{f[0]}: {f[1]}')

    return succeeded, failed


def reprocess_dataset_remote(
    sm_src: SMInstance,
    sm_dst: SMInstance,
    src_ds_id: str,
    dst_ds_id: str,
    update_metadata_func,
    skip_existing=True,
):
    try:
        dst_ds = sm_dst.dataset(id=dst_ds_id)
        assert dst_ds.status == 'FINISHED'
        assert any(diag['type'] == DiagnosticType.FDR_RESULTS for diag in dst_ds.diagnostics(False))
        existing = True
    except Exception:
        existing = False

    if skip_existing and existing:
        print(f'Skipping {dst_ds_id}\n', end=None)
        return dst_ds_id, None

    smds = sm_src.dataset(id=src_ds_id)
    ds_metadata, ds_config = update_metadata_func(smds.metadata, smds.config)

    # pylint: disable=protected-access  # There's no other clean way to get _gqclient
    gqclient_dst = sm_dst._gqclient
    graphql_response = gqclient_dst.create_dataset(
        {
            'name': smds.name,
            'inputPath': smds.s3dir,
            'metadataJson': json.dumps(ds_metadata),
            'databaseIds': ds_config['database_ids'],
            'adducts': ds_config['isotope_generation']['adducts'],
            'neutralLosses': ds_config['isotope_generation']['neutral_losses'],
            'chemMods': ds_config['isotope_generation']['chem_mods'],
            'ppm': ds_config['image_generation']['ppm'],
            'numPeaks': ds_config['isotope_generation']['n_peaks'],
            'decoySampleSize': ds_config['fdr']['decoy_sample_size'],
            'analysisVersion': ds_config['analysis_version'],
            'submitterId': sm_dst.current_user_id(),
            'groupId': gqclient_dst.get_primary_group_id(),
            # 'projectIds': project_ids,
            'isPublic': False,
            'scoringModel': ds_config['fdr'].get('scoring_model'),
            'computeUnusedMetrics': ds_config['image_generation']['compute_unused_metrics'],
        },
        ds_id=dst_ds_id,  # Requires admin account
    )
    return json.loads(graphql_response)['datasetId']


def wait_for_datasets(sm_dst, dataset_ids, raise_on_error=True):
    pending_dataset_ids = dataset_ids.copy()
    successful = []
    errors = []
    while pending_dataset_ids:
        print(
            f'Waiting for {len(pending_dataset_ids)} datasets... '
            f'({len(successful)} succeeded, {len(errors)} failed)'
        )
        for ds_id in pending_dataset_ids.copy():
            try:
                smds = sm_dst.dataset(id=ds_id)
                if smds.status == 'FINISHED':
                    successful.append(ds_id)
                    pending_dataset_ids.remove(ds_id)
                elif smds.status == 'FAILED':
                    if raise_on_error:
                        raise Exception(f'Dataset {ds_id} failed')
                    else:
                        pending_dataset_ids.remove(ds_id)
                        errors.append((ds_id, 'FAILED'))
                        logger.warning(f'Dataset {ds_id} failed')
            except Exception as e:
                logger.warning(f'Dataset {ds_id} error', exc_info=not raise_on_error)
                if raise_on_error:
                    raise
                else:
                    pending_dataset_ids.remove(ds_id)
                    errors.append((ds_id, e))

        time.sleep(5)
    return successful, errors
