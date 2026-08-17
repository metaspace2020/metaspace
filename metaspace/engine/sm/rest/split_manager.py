"""Queueing for dataset-split jobs.

sm-graphql has already created the ``dataset_split_job`` and ``dataset_split_child`` rows by the
time this is called; all this does is mark the job queued and hand it to the SM_UPDATE daemon,
mirroring :mod:`sm.rest.segmentation_manager`.
"""

import logging
import threading
import time
from typing import Any, Dict, List

from sm.engine.config import SMConfig
from sm.engine.daemons.actions import DaemonAction
from sm.engine.dataset_split_runner import SplitJobStatus, roi_pixel_counts
from sm.engine.queue import QueuePublisher, SM_UPDATE

logger = logging.getLogger(__name__)

# How long to wait for a queued split to leave QUEUED/STARTED before republishing the next one.
_REPUBLISH_POLL_INTERVAL = 5
_REPUBLISH_TIMEOUT = 60 * 60


class SplitManager:
    """Manages dataset-split job submission."""

    def __init__(self, db):
        self._db = db
        self._sm_config = SMConfig.get_conf()

    def _create_update_queue_publisher(self):
        return QueuePublisher(self._sm_config['rabbitmq'], SM_UPDATE, logger)

    def run_split(self, job_id: int, use_lithops: bool = False) -> Dict[str, Any]:
        """Mark a split job queued and publish it to the SM_UPDATE queue."""
        job = self._db.select_one(
            'SELECT parent_ds_id, status FROM dataset_split_job WHERE id = %s', params=(job_id,)
        )
        if not job:
            raise Exception(f'Split job {job_id} does not exist')
        ds_id = job[0]

        self._db.alter(
            'UPDATE dataset_split_job SET status = %s, updated_at = NOW() WHERE id = %s',
            params=(SplitJobStatus.QUEUED, job_id),
        )

        queue_publisher = self._create_update_queue_publisher()
        queue_publisher.publish(
            {
                'action': DaemonAction.SPLIT,
                'ds_id': ds_id,
                'job_id': job_id,
                'use_lithops': use_lithops,
            }
        )
        logger.info(f'Split job {job_id} queued for dataset {ds_id}')
        return {'job_id': job_id, 'ds_id': ds_id}

    def roi_stats(self, ds_id: str, roi_ids: List[int] = None) -> Dict[str, Any]:
        """Per-ROI pixel counts backing the split dialog's size guard."""
        return {'ds_id': ds_id, 'rois': roi_pixel_counts(self._db, ds_id, roi_ids)}

    def restart_pending_jobs(self) -> Dict[str, Any]:
        """Republish split jobs left QUEUED/STARTED by a daemon restart, one at a time."""
        pending = self._db.select(
            '''SELECT id, parent_ds_id FROM dataset_split_job
               WHERE status IN (%s, %s) ORDER BY id''',
            params=(SplitJobStatus.QUEUED, SplitJobStatus.STARTED),
        )
        if not pending:
            return {'queued': 0}

        threading.Thread(
            target=self._sequential_republish_worker, args=(pending,), daemon=True
        ).start()
        return {'queued': len(pending)}

    def _sequential_republish_worker(self, pending: List) -> None:
        try:
            queue_publisher = self._create_update_queue_publisher()
        except Exception as e:  # pylint: disable=broad-except
            logger.error(f'Sequential split republish: failed to open publisher: {e}')
            return

        for job_id, ds_id in pending:
            try:
                queue_publisher.publish(
                    {'action': DaemonAction.SPLIT, 'ds_id': ds_id, 'job_id': job_id}
                )
                self._wait_for_job_settled(job_id)
            except Exception as e:  # pylint: disable=broad-except
                logger.error(f'Failed to republish split job {job_id}: {e}')

    def _wait_for_job_settled(self, job_id: int) -> None:
        deadline = time.time() + _REPUBLISH_TIMEOUT
        while time.time() < deadline:
            row = self._db.select_one(
                'SELECT status FROM dataset_split_job WHERE id = %s', params=(job_id,)
            )
            if not row or row[0] not in (SplitJobStatus.QUEUED, SplitJobStatus.STARTED):
                return
            time.sleep(_REPUBLISH_POLL_INTERVAL)
        logger.warning(f'Split job {job_id} did not settle within the republish timeout')
