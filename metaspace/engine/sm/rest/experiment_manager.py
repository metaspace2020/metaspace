"""Manager for experiment statistical analysis runs.

Mirrors :class:`sm.rest.segmentation_manager.SegmentationManager`: writes
job state directly to the ``experiment`` row (single-phase, 3-table
schema) and dispatches the actual statistical work to a service via
the ``SM_UPDATE`` RabbitMQ queue.

Schema notes:

* ``experiment`` carries the full run lifecycle inline (``run_status``,
  ``run_stage``, ``run_generation``, ``run_started_at``, ``run_error``,
  ``run_finished_at``, ``run_inferred_test``, ``run_qc``).
* ``experiment_result`` rows carry an ``ion_id`` (FK to ``graphql.ion``)
  and ``label_group_name`` (text); old ``annotation_key`` and
  ``label_group_id`` columns are gone.
* Stale callbacks (whose ``run_generation`` no longer matches the row)
  are silently dropped.
"""

import gzip
import json
import logging
import threading
import time
from io import BytesIO
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError
from psycopg2.extras import Json

from sm.engine.config import SMConfig
from sm.engine.daemons.actions import DaemonAction
from sm.engine.queue import QueuePublisher, SM_UPDATE
from sm.engine.storage import get_s3_resource

logger = logging.getLogger(__name__)


class ExperimentManager:
    """Manage experiment statistical-analysis runs."""

    def __init__(self, db):
        """Store the DB handle and load the SM config.

        Args:
            db: An :class:`sm.engine.db.DB` instance.
        """
        self._db = db
        self._sm_config = SMConfig.get_conf()

        if 'aws' in self._sm_config:
            self.ses = boto3.client(
                'ses',
                region_name=self._sm_config['aws']['aws_default_region'],
                aws_access_key_id=self._sm_config['aws']['aws_access_key_id'],
                aws_secret_access_key=self._sm_config['aws']['aws_secret_access_key'],
            )
        else:
            self.ses = None

    def _create_update_queue_publisher(self):
        """Create a queue publisher for the SM_UPDATE queue."""
        return QueuePublisher(self._sm_config['rabbitmq'], SM_UPDATE, logger)

    def run_experiment(
        self,
        experiment_id: str,
        run_generation: int,
        email: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Reset the ``experiment`` row to ``PREPARING`` and publish a job.

        Args:
            experiment_id: UUID of the experiment.
            run_generation: New run generation assigned by the GraphQL
                resolver (monotonic per experiment).
            email: Optional address for completion notification.

        Returns:
            Dict with ``experiment_id`` and ``run_generation``.
        """
        self._db.alter(
            "UPDATE experiment SET run_status='PREPARING', run_stage='PREP', "
            "run_generation=%s, run_started_at=NOW(), run_error=NULL, "
            "run_finished_at=NULL WHERE id=%s",
            params=(run_generation, experiment_id),
        )

        queue_publisher = self._create_update_queue_publisher()
        msg = {
            'action': DaemonAction.EXPERIMENT_STATS,
            'experiment_id': experiment_id,
            'run_generation': run_generation,
        }
        if email:
            msg['email'] = email
        queue_publisher.publish(msg)

        logger.info(f'Experiment {experiment_id} run_generation={run_generation} queued')
        return {'experiment_id': experiment_id, 'run_generation': run_generation}

    # Per-job poll/timeout when republishing pending jobs sequentially. Prep is
    # heavy (multi-MB ES queries + intensity matrix build); running them in
    # parallel risks OOM on the update-daemon. Sequential republishing trickles
    # them through and keeps memory bounded. Timeout is generous so a single
    # genuinely-long run doesn't strand the rest forever.
    _RESTART_POLL_INTERVAL_S = 5
    _RESTART_PER_JOB_TIMEOUT_S = 30 * 60  # 30 min — well above normal prep+stats

    def restart_pending_jobs(self) -> Dict[str, Any]:
        """Republish EXPERIMENT_STATS jobs whose runs are still in flight.

        Mirrors :meth:`SegmentationManager.restart_pending_jobs` but
        republishes one job at a time on a background thread, polling the
        ``experiment`` row until each leaves the in-flight statuses before
        sending the next. This avoids the thundering-herd / parallel-OOM
        failure mode where multiple heavy prep steps run concurrently after
        a service restart.

        Returns:
            Dict with ``restarted_count`` — count of pending rows found
            (and queued for sequential republish, not necessarily finished
            by the time the HTTP response returns).
        """
        try:
            rows = self._db.select(
                "SELECT id, run_generation FROM experiment "
                "WHERE run_status IN ('PREPARING', 'RUNNING') "
                "ORDER BY run_started_at ASC NULLS FIRST",
            )
            if not rows:
                logger.info('No pending experiment_stats jobs found to restart')
                return {'restarted_count': 0}
            # pylint: disable=unnecessary-comprehension
            pending = [(exp_id, gen) for exp_id, gen in rows]
            threading.Thread(
                target=self._sequential_republish_worker,
                args=(pending,),
                daemon=True,
                name='experiment-restart-pending',
            ).start()
            logger.info(
                f'Queued {len(pending)} pending experiment_stats jobs for sequential republish'
            )
            return {'restarted_count': len(pending)}
        except Exception as e:
            logger.error(f'Failed to restart pending experiment_stats jobs: {e}', exc_info=True)
            raise

    def _sequential_republish_worker(self, pending: List) -> None:
        """Background worker: publish one job, wait for it to finish, repeat.

        Uses a fresh ``QueuePublisher`` so it owns its own AMQP channel.
        Reads ``experiment.run_status`` after each publish; advances when
        the row leaves ``PREPARING``/``RUNNING`` (or after a per-job
        timeout, to avoid a single stuck job blocking the queue forever).
        """
        try:
            queue_publisher = self._create_update_queue_publisher()
        except Exception as e:  # pylint: disable=broad-except
            logger.error(f'Sequential republish: failed to open queue publisher: {e}')
            return

        for experiment_id, run_generation in pending:
            msg = {
                'action': DaemonAction.EXPERIMENT_STATS,
                'experiment_id': experiment_id,
                'run_generation': run_generation,
            }
            try:
                queue_publisher.publish(msg)
                logger.info(
                    f'Republished experiment_stats {experiment_id} '
                    f'run_generation={run_generation} (waiting for completion)'
                )
            except Exception as e:  # pylint: disable=broad-except
                logger.error(f'Failed to republish experiment_stats {experiment_id}: {e}')
                continue

            self._wait_for_run_settled(experiment_id, run_generation)

    def _wait_for_run_settled(self, experiment_id: str, run_generation: int) -> None:
        """Block until the experiment row leaves PREPARING/RUNNING (or timeout)."""
        deadline = time.monotonic() + self._RESTART_PER_JOB_TIMEOUT_S
        while time.monotonic() < deadline:
            try:
                row = self._db.select_one(
                    "SELECT run_status, run_generation FROM experiment WHERE id=%s",
                    params=(experiment_id,),
                )
            except Exception as e:  # pylint: disable=broad-except
                logger.warning(
                    f'Sequential republish: DB poll failed for {experiment_id}: {e}; ' f'continuing'
                )
                return
            if not row:
                return
            status, current_gen = row
            # If a newer run was kicked off elsewhere, our generation is stale
            # and there's nothing to wait for — let the next job through.
            if current_gen != run_generation:
                return
            if status not in ('PREPARING', 'RUNNING'):
                return
            time.sleep(self._RESTART_POLL_INTERVAL_S)
        logger.warning(
            f'Sequential republish: experiment {experiment_id} '
            f'run_generation={run_generation} did not settle within '
            f'{self._RESTART_PER_JOB_TIMEOUT_S}s; advancing to next job'
        )

    def handle_experiment_callback(  # pylint: disable=too-many-arguments
        self,
        experiment_id: str,
        run_generation: int,
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        email: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Persist the service's result for ``experiment_id``.

        Args:
            experiment_id: UUID of the experiment.
            run_generation: Run generation reported by the service.
                If it doesn't match the current ``experiment.run_generation``,
                the callback is treated as stale and ignored.
            status: ``'FINISHED'`` or ``'FAILED'``.
            result: Result payload from the service (when finished).
            error: Error message (when failed).
            email: Optional address for completion notification.

        Returns:
            Dict with ``experiment_id``, ``run_generation``, ``status``.
        """
        row = self._db.select_one(
            'SELECT run_generation FROM experiment WHERE id=%s',
            params=(experiment_id,),
        )
        if not row:
            logger.warning(
                f'Callback for unknown experiment {experiment_id} '
                f'(run_generation={run_generation}); ignoring'
            )
            return {
                'experiment_id': experiment_id,
                'run_generation': run_generation,
                'status': 'ignored',
            }
        current_generation = row[0]
        if current_generation != run_generation:
            logger.info(
                f'Stale callback for experiment {experiment_id}: '
                f'callback gen={run_generation} but row gen={current_generation}; ignoring'
            )
            return {
                'experiment_id': experiment_id,
                'run_generation': run_generation,
                'status': 'stale',
            }

        if status == 'FINISHED':
            self._write_results(experiment_id, run_generation, result or {})
            inferred_test = (result or {}).get('inferred_test')
            run_qc = (result or {}).get('run_qc')
            self._db.alter(
                "UPDATE experiment SET run_status='FINISHED', run_stage='DONE', "
                "run_finished_at=NOW(), run_inferred_test=%s, run_qc=%s WHERE id=%s",
                params=(
                    inferred_test,
                    Json(run_qc) if run_qc is not None else None,
                    experiment_id,
                ),
            )
        else:
            self._db.alter(
                "UPDATE experiment SET run_status='FAILED', run_error=%s, "
                "run_finished_at=NOW() WHERE id=%s",
                params=(error or 'unknown', experiment_id),
            )

        if email:
            try:
                self._send_completion_email(experiment_id, status, email, error)
            except Exception:  # pylint: disable=broad-except
                logger.exception(f'Failed to send experiment completion email for {experiment_id}')

        return {
            'experiment_id': experiment_id,
            'run_generation': run_generation,
            'status': status,
        }

    def _write_results(self, experiment_id: str, run_generation: int, result: Dict[str, Any]):
        """Wipe stale results and insert this run's rows.

        Args:
            experiment_id: UUID of the experiment.
            run_generation: Current run generation; rows from older
                generations are deleted.
            result: Microservice result payload (``results`` list).
        """
        # Drop rows from older generations and any prior rows at this
        # generation (so retries are idempotent).
        self._db.alter(
            'DELETE FROM experiment_result WHERE experiment_id=%s ' 'AND run_generation <= %s',
            params=(experiment_id, run_generation),
        )

        for row in result.get('results', []) or []:
            self._db.alter(
                'INSERT INTO experiment_result '
                '(experiment_id, run_generation, ion_id, label_group_name, '
                'lfc, p_value, fdr, detection_rate_a, detection_rate_b, n_a, n_b) '
                'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                params=(
                    experiment_id,
                    run_generation,
                    row['ion_id'],
                    row['label_group_name'],
                    row['lfc'],
                    row['p_value'],
                    row.get('fdr'),
                    row['detection_rate_a'],
                    row['detection_rate_b'],
                    row['n_a'],
                    row['n_b'],
                ),
            )

        # Per-ion per-region intensities are stored as a single gzipped JSON
        # blob in S3 (one object per (experiment_id, run_generation)) rather
        # than a SQL table — the data is large, write-once, and only ever
        # filtered by ion_id at read time. Mirrors the bucket selection used
        # by sm.engine.postprocessing.segmentation_data_loader (uses the
        # general-purpose `image_storage.bucket`, since we don't want to add a
        # new top-level config key just for this).
        intensity_rows = result.get('intensity_rows') or []
        if intensity_rows:
            self._write_intensity_blob(experiment_id, run_generation, intensity_rows)

    @staticmethod
    def _intensity_blob_key(experiment_id: str, run_generation: int) -> str:
        return f'experiments/{experiment_id}/{run_generation}/intensities.json.gz'

    def _write_intensity_blob(
        self,
        experiment_id: str,
        run_generation: int,
        intensity_rows: List[Dict[str, Any]],
    ) -> None:
        buf = BytesIO()
        with gzip.GzipFile(fileobj=buf, mode='wb') as gz_file:
            gz_file.write(json.dumps(intensity_rows).encode('utf-8'))
        buf.seek(0)
        bucket_name = self._sm_config['image_storage']['bucket']
        s3_key = self._intensity_blob_key(experiment_id, run_generation)
        get_s3_resource(self._sm_config).Bucket(bucket_name).put_object(Key=s3_key, Body=buf.read())
        logger.info(
            f'Experiment {experiment_id} gen={run_generation}: '
            f'wrote {len(intensity_rows)} intensity rows → s3://{bucket_name}/{s3_key}'
        )

    def get_ion_intensities(self, experiment_id: str, ion_id: int) -> Dict[str, Any]:
        """Read the experiment's intensity blob from S3, filter by ``ion_id``,
        and enrich each row with region metadata from
        ``experiment_dataset.regions``.

        Returns ``{'rows': [...]}``. If the blob does not exist (e.g. an
        experiment from before S3 storage was introduced), returns an empty
        list and logs a warning rather than raising.
        """
        gen_row = self._db.select_one(
            'SELECT run_generation FROM experiment WHERE id=%s',
            params=(experiment_id,),
        )
        if not gen_row:
            return {'rows': []}
        run_generation = gen_row[0]

        bucket_name = self._sm_config['image_storage']['bucket']
        s3_key = self._intensity_blob_key(experiment_id, run_generation)
        try:
            obj = get_s3_resource(self._sm_config).Object(bucket_name, s3_key).get()
            raw = gzip.GzipFile(fileobj=BytesIO(obj['Body'].read())).read()
            all_rows = json.loads(raw.decode('utf-8'))
        except ClientError as e:
            code = e.response.get('Error', {}).get('Code', '')
            if code in ('NoSuchKey', '404', 'NotFound'):
                logger.warning(
                    f'Experiment {experiment_id} gen={run_generation}: '
                    f'no intensity blob at s3://{bucket_name}/{s3_key}'
                )
                return {'rows': []}
            raise

        # Build region_key -> metadata lookup from experiment_dataset.regions.
        meta_map: Dict[str, Dict[str, Optional[str]]] = {}
        ds_rows = self._db.select(
            'SELECT regions FROM experiment_dataset WHERE experiment_id=%s',
            params=(experiment_id,),
        )
        for (regions,) in ds_rows or []:
            for region in regions or []:
                region_key = region.get('regionKey')
                md_dict = region.get('metadata') or {}
                if region_key is None:
                    continue
                meta_map[region_key] = {
                    'condition': md_dict.get('condition'),
                    'sampleId': md_dict.get('sampleId'),
                    'biologicalReplicateId': md_dict.get('biologicalReplicateId'),
                }

        out = []
        for row in all_rows:
            if int(row.get('ion_id', -1)) != int(ion_id):
                continue
            md_dict = meta_map.get(
                row.get('region_key'),
                {
                    'condition': None,
                    'sampleId': None,
                    'biologicalReplicateId': None,
                },
            )
            out.append(
                {
                    'regionKey': row.get('region_key'),
                    'intensity': row.get('intensity'),
                    'condition': md_dict.get('condition'),
                    'sampleId': md_dict.get('sampleId'),
                    'biologicalReplicateId': md_dict.get('biologicalReplicateId'),
                }
            )
        return {'rows': out}

    def _send_email(self, email: str, subject: str, body: str):
        """Send email via SES (matches SegmentationManager._send_email)."""
        if not self._sm_config.get('services', {}).get('send_email', True):
            return
        if not self.ses:
            logger.warning('SES client not configured, cannot send email')
            return
        try:
            resp = self.ses.send_email(
                Source='contact@metaspace2020.org',
                Destination={'ToAddresses': [email]},
                Message={'Subject': {'Data': subject}, 'Body': {'Text': {'Data': body}}},
            )
        except ClientError as e:
            logger.warning(f'Send email exception {e} for {email}')
        else:
            if resp['ResponseMetadata']['HTTPStatusCode'] == 200:
                logger.info(f'Email with "{subject}" subject was sent to {email}')
            else:
                logger.warning(f'SES failed to send email to {email}')

    def _send_completion_email(
        self,
        experiment_id: str,
        status: str,
        email: str,
        error: Optional[str] = None,
    ):
        """Send a completion notification for an experiment run."""
        if status == 'FINISHED':
            subject = 'METASPACE service notification (EXPERIMENT SUCCESS)'
            body = (
                'Dear METASPACE user,\n\n'
                f'Your METASPACE experiment {experiment_id} statistical analysis '
                'has completed successfully.\n\n'
                'Best regards,\n'
                'METASPACE Team'
            )
        else:
            subject = 'METASPACE service notification (EXPERIMENT FAILED)'
            body = (
                'Dear METASPACE user,\n\n'
                f'Your METASPACE experiment {experiment_id} statistical analysis '
                'has failed.\n'
                f'Error details: {error or "unknown error"}\n\n'
                'Best regards,\n'
                'METASPACE Team'
            )
        self._send_email(email, subject, body)
