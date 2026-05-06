"""Submit a cross-dataset experiment statistical analysis job to the
``stats_analysis`` service.
"""
import logging
from typing import Any, Dict, List, Optional

import requests

from sm.engine.config import SMConfig
from sm.engine.db import DB
from sm.engine.postprocessing.experiment_prep import build_prep_block

logger = logging.getLogger('engine')


def _load_experiment_payload(
    db: DB, experiment_id: str, run_generation: int, callback_url: str
) -> Dict[str, Any]:
    """Build the service request body for ``experiment_id``.

    Args:
        db: Live :class:`sm.engine.db.DB` handle.
        experiment_id: UUID of the experiment.
        run_generation: Engine-assigned run generation.
        callback_url: URL the service must POST results back to.

    Returns:
        Dict matching the service's request schema.

    Raises:
        Exception: If no ``experiment`` row is found for ``experiment_id``.
    """
    row = db.select_one(
        'SELECT label_groups, run_excluded_samples, run_filters ' 'FROM experiment WHERE id=%s',
        params=(experiment_id,),
    )
    if not row:
        raise Exception(f'experiment {experiment_id} not found')
    label_groups, excluded_samples, filters = row

    ds_rows = db.select(
        'SELECT dataset_id, region_source, regions FROM experiment_dataset '
        'WHERE experiment_id=%s ORDER BY id',
        params=(experiment_id,),
    )
    datasets: List[Dict[str, Any]] = [
        {'dataset_id': ds_id, 'region_source': region_source, 'regions': regions or []}
        for ds_id, region_source, regions in ds_rows
    ]

    prep = build_prep_block(db, datasets, filters or {})

    return {
        'experiment_id': experiment_id,
        'run_generation': run_generation,
        'label_groups': label_groups or [],
        'datasets': datasets,
        'excluded_samples': excluded_samples or [],
        'filters': filters or {},
        'prep': prep,
        'callback_url': callback_url,
    }


def submit_experiment_job(
    experiment_id: str,
    run_generation: int,
    email: Optional[str] = None,
    db: Optional[DB] = None,
) -> None:
    """Submit an experiment run to the ``stats_analysis`` service.

    Args:
        experiment_id: UUID of the experiment row.
        run_generation: Engine-assigned run generation.
        email: Optional submitter email forwarded to the service so
            the callback handler can fire a completion notification.
        db: Optional :class:`sm.engine.db.DB` handle; a new one is
            created when omitted (so the daemon can pass its own).

    Raises:
        requests.HTTPError: Service returned a non-2xx status.
        requests.RequestException: Network or connection failure.
    """
    config = SMConfig.get_conf()
    services = config.get('services', {})
    # stats_analysis is co-hosted with image_segmentation behind /experiment.
    segmentation_url = services.get('segmentation', 'http://image-segmentation:9877')
    stats_run_url = f'{segmentation_url}/experiment/run'
    callback_url = services.get('experiment_callback', 'http://api:5123/v1/experiment/callback')

    if db is None:
        db = DB()

    payload = _load_experiment_payload(db, experiment_id, run_generation, callback_url)
    if email:
        payload['email'] = email

    logger.info(
        f'Submitting experiment {experiment_id} run_generation={run_generation} '
        f'to {stats_run_url}'
    )
    response = requests.post(stats_run_url, json=payload, timeout=30)
    response.raise_for_status()
