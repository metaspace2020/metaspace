import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from sm.engine.config import SMConfig
from sm.engine.daemons.actions import DaemonAction, DaemonActionStage
from sm.engine.queue import QueuePublisher, SM_UPDATE
from sm.engine.postprocessing.segmentation_wrapper import save_segmentation_result

logger = logging.getLogger(__name__)


class SegmentationManager:
    """Class for managing segmentation operations."""

    def __init__(self, db):
        self._db = db
        self._sm_config = SMConfig.get_conf()

        # Initialize SES client for email notifications
        if 'aws' in self._sm_config:
            self.ses = boto3.client(
                'ses',
                'eu-west-1',
                aws_access_key_id=self._sm_config['aws']['access_key_id'],
                aws_secret_access_key=self._sm_config['aws']['secret_access_key'],
            )
        else:
            self.ses = None

    def _create_update_queue_publisher(self):
        """Create queue publisher for SM_UPDATE."""
        return QueuePublisher(self._sm_config['rabbitmq'], SM_UPDATE, logger)

    def run_segmentation(  # pylint: disable=too-many-arguments
        self,
        ds_id: str,
        algorithm: str = 'pca_gmm',
        database_ids: list = None,
        fdr: float = 0.2,
        params: dict = None,
        adducts: Optional[list] = None,
        min_mz: Optional[float] = None,
        max_mz: Optional[float] = None,
        off_sample: Optional[bool] = None,
        email: Optional[str] = None,
    ):
        """Run segmentation analysis.

        Args:
            ds_id: Dataset ID
            algorithm: Segmentation algorithm (default 'pca_gmm')
            database_ids: List of database IDs (default [])
            fdr: False discovery rate (default 0.2)
            params: Algorithm parameters (default {})
            adducts: List of adducts to filter by
            min_mz: Minimum m/z value
            max_mz: Maximum m/z value
            off_sample: Off-sample filter
            email: Email for notifications

        Returns:
            dict: Job information with job_id
        """
        if database_ids is None:
            database_ids = []
        if params is None:
            params = {}

        # Insert a QUEUED job row and retrieve its id
        job_ids = self._db.insert_return(
            '''INSERT INTO image_segmentation_job (ds_id, status)
               VALUES (%s, %s)
               RETURNING id''',
            rows=[(ds_id, DaemonActionStage.QUEUED)],
        )
        job_id = job_ids[0]

        # Publish the job to the SM_UPDATE queue for the daemon to pick up
        queue_publisher = self._create_update_queue_publisher()
        msg = {
            'action': DaemonAction.SEGMENTATION,
            'ds_id': ds_id,
            'job_id': job_id,
            'algorithm': algorithm,
            'database_ids': database_ids,
            'fdr': fdr,
            'params': params,
        }
        if adducts is not None:
            msg['adducts'] = adducts
        if min_mz is not None:
            msg['min_mz'] = min_mz
        if max_mz is not None:
            msg['max_mz'] = max_mz
        msg['off_sample'] = off_sample
        if email:
            msg['email'] = email
        queue_publisher.publish(msg)

        logger.info(f'Segmentation job {job_id} queued for dataset {ds_id}')
        return {'job_id': job_id, 'ds_id': ds_id}

    def handle_segmentation_callback(
        self,
        job_id: int,
        ds_id: str,
        status: str,
        result: dict = None,
        error: str = None,
        email: Optional[str] = None,
    ):
        """Handle segmentation callback results.

        Args:
            job_id: Segmentation job ID
            ds_id: Dataset ID
            status: Job status ('ok' or 'failed')
            result: Segmentation result data (if successful)
            error: Error message (if failed)
            email: Email address for notifications

        Returns:
            dict: Status information
        """
        if status == 'ok':
            logger.info(
                f'Received successful segmentation result for job {job_id}, dataset {ds_id}'
            )
            save_segmentation_result(ds_id, job_id, result, self._db)

            # Send success email notification if email is provided
            if email:
                try:
                    self._send_success_email(ds_id, job_id, email)
                except Exception as e:
                    logger.warning(f'Failed to send success email for job {job_id}: {e}')
        else:
            error_msg = error or 'unknown error'
            logger.error(f'Segmentation job {job_id} for dataset {ds_id} failed: {error_msg}')
            self._db.alter(
                """UPDATE image_segmentation_job SET
                 status = 'FAILED', error = %s, updated_at = NOW() WHERE id = %s""",
                params=(error_msg, job_id),
            )

            # Send failure email notification if email is provided
            if email:
                try:
                    self._send_failure_email(ds_id, job_id, email, error_msg)
                except Exception as e:
                    logger.warning(f'Failed to send failure email for job {job_id}: {e}')

        return {'status': 'processed', 'job_id': job_id, 'ds_id': ds_id}

    def _send_email(self, email: str, subject: str, body: str):
        """Send email using SES."""
        if not self._sm_config['services'].get('send_email', True):
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

    def _get_dataset_name(self, ds_id: str):
        """Get dataset name from database."""
        try:
            result = self._db.select_one('SELECT name FROM dataset WHERE id = %s', params=(ds_id,))
            return result[0] if result else ds_id
        except Exception:
            return ds_id

    def _send_success_email(self, ds_id: str, job_id: int, email: str):
        """Send success email notification."""
        ds_name = self._get_dataset_name(ds_id)
        subject = 'METASPACE service notification (SEGMENTATION SUCCESS)'
        body = (
            'Dear METASPACE user,\n\n'
            f'Thank you for submitting the segmentation job for the "{ds_name}" dataset. '
            'We are pleased to inform you that the segmentation analysis '
            f'for dataset {ds_id} and job {job_id} '
            f'has been completed successfully. '
            f'You can view the results in the METASPACE web interface.\n\n'
            f'Dataset ID: {ds_id}\n'
            f'Job ID: {job_id}\n\n'
            'Best regards,\n'
            'METASPACE Team'
        )
        self._send_email(email, subject, body)

    def _send_failure_email(self, ds_id: str, job_id: int, email: str, error: str):
        """Send failure email notification."""
        ds_name = self._get_dataset_name(ds_id)
        subject = 'METASPACE service notification (SEGMENTATION FAILED)'
        body = (
            'Dear METASPACE user,\n\n'
            f'We regret to inform you that the segmentation job for '
            f'the "{ds_name}" dataset and job {job_id} has failed. '
            f'Error details: {error}\n\n'
            f'Dataset ID: {ds_id}\n'
            f'Job ID: {job_id}\n\n'
            'Please check your input parameters and try again. If the problem persists, '
            'please contact our support team.\n\n'
            'Best regards,\n'
            'METASPACE Team'
        )
        self._send_email(email, subject, body)
