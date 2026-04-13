import json
import logging
import urllib.parse
import time

import boto3
import elasticsearch
from botocore.exceptions import ClientError
from requests.api import post

from sm.engine import molecular_db
from sm.engine.annotation.diagnostics import del_diagnostics
from sm.engine.annotation.job import del_jobs
from sm.engine.annotation_lithops.annotation_job import ServerAnnotationJob
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_spark.annotation_job import AnnotationJob
from sm.engine.postprocessing.cloudwatch import get_costs, add_cost_to_perf_profile_entries
from sm.engine.postprocessing.colocalization import Colocalization
from sm.engine.daemons.actions import DaemonActionStage
from sm.engine.dataset import Dataset, DatasetStatus
from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.postprocessing.ion_thumbnail import (
    generate_ion_thumbnail,
    generate_ion_thumbnail_lithops,
    delete_ion_thumbnail,
)
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper
from sm.engine.postprocessing.off_sample_wrapper import classify_dataset_ion_images
from sm.engine.postprocessing.segmentation_wrapper import submit_segmentation_job
from sm.engine.postprocessing.ds_size_hash import save_size_hash
from sm.engine.optical_image import del_optical_image
from sm.engine.config import SMConfig
from sm.engine.utils.perf_profile import perf_profile


class DatasetManager:
    def __init__(self, db, es, status_queue=None, logger=None, sm_config=None):
        self._sm_config = sm_config or SMConfig.get_conf()
        self._slack_conf = self._sm_config.get('slack', {})
        self._db: DB = db
        self._es: ESExporter = es
        self._status_queue = status_queue
        self.logger = logger or logging.getLogger()
        self.costs = None

        if 'aws' in self._sm_config:
            self.ses = boto3.client(
                'ses',
                'eu-west-1',
                aws_access_key_id=self._sm_config['aws']['aws_access_key_id'],
                aws_secret_access_key=self._sm_config['aws']['aws_secret_access_key'],
            )

            self.cloudwatch = boto3.client(
                'logs',
                'eu-west-1',
                aws_access_key_id=self._sm_config['aws']['aws_access_key_id'],
                aws_secret_access_key=self._sm_config['aws']['aws_secret_access_key'],
            )

    def post_to_slack(self, emoji, msg):
        if self._slack_conf.get('webhook_url', None):
            doc = {
                'channel': self._slack_conf['channel'],
                'username': 'webhookbot',
                'text': f":{emoji}:{msg}",
                'icon_emoji': ':robot_face:',
            }
            post(self._slack_conf['webhook_url'], json=doc)

    def fetch_ds_metadata(self, ds_id):
        res = self._db.select_one(
            'SELECT name, metadata FROM dataset WHERE id = %s', params=(ds_id,)
        )
        return res or ('', {})

    def create_web_app_link(self, msg):
        link = None
        try:
            _, ds_meta = self.fetch_ds_metadata(msg['ds_id'])
            md_type_quoted = urllib.parse.quote(ds_meta['Data_Type'])
            base_url = self._sm_config['services']['web_app_url']
            ds_id_quoted = urllib.parse.quote(msg['ds_id'])
            link = f'{base_url}/annotations?mdtype={md_type_quoted}&ds={ds_id_quoted}'
        except Exception as e:
            self.logger.error(e)
        return link

    def create_segmentation_web_app_link(self, msg):
        link = None
        try:
            base_url = self._sm_config['services']['web_app_url']
            link = f"{base_url}/dataset/{msg['ds_id']}/segmentation"
        except Exception as e:
            self.logger.error(e)
        return link

    def load_ds(self, ds_id):
        return Dataset.load(self._db, ds_id)

    def set_ds_status(self, ds, status):
        ds.set_status(self._db, self._es, status)

    def notify_update(self, ds_id, action, stage):
        self._status_queue.publish({'ds_id': ds_id, 'action': action, 'stage': stage})

    def classify_dataset_images(self, ds):
        classify_dataset_ion_images(self._db, ds, self._sm_config['services'])

    def annotate(self, ds, del_first=False):
        """Run an annotation job for the dataset. If del_first provided, delete first"""
        if del_first:
            self.logger.warning(f'Deleting all results for dataset: {ds.id}')
            del_jobs(ds)
        ds.save(self._db, self._es)
        with perf_profile(self._db, 'annotate_spark', ds.id) as perf:
            AnnotationJob(ds=ds, sm_config=self._sm_config, perf=perf).run()

            if self._sm_config['services'].get('colocalization', True):
                Colocalization(self._db).run_coloc_job(ds, reprocess=del_first)
                perf.record_entry('ran colocalization')

            if self._sm_config['services'].get('ion_thumbnail', True):
                generate_ion_thumbnail(db=self._db, ds=ds, only_if_needed=not del_first)
                perf.record_entry('generated ion thumbnail')

    def annotate_lithops(self, ds: Dataset, del_first=False, perform_enrichment=False):
        if del_first:
            self.logger.warning(f'Deleting all results for dataset: {ds.id}')
            del_jobs(ds)
        ds.save(self._db, self._es)
        with perf_profile(self._db, 'annotate_lithops', ds.id) as perf:
            executor = Executor(self._sm_config['lithops'], perf=perf)

            job = ServerAnnotationJob(executor, ds, perf, perform_enrichment=perform_enrichment)
            job.run()

            if self._sm_config['services'].get('colocalization', True):
                Colocalization(self._db).run_coloc_job_lithops(executor, ds, reprocess=del_first)

            if self._sm_config['services'].get('ion_thumbnail', True):
                generate_ion_thumbnail_lithops(
                    executor=executor,
                    db=self._db,
                    ds=ds,
                    only_if_needed=not del_first,
                )

            profile_id = perf._profile_id  # pylint: disable=protected-access

        save_size_hash(
            executor=executor, ds=ds, db=self._db, imzml_cobj=job.imzml_cobj, ibd_cobj=job.ibd_cobj
        )

        # costs from Cloudwatch Logs
        log_groups = self._sm_config['lithops'].get('aws_lambda', {}).get('cloudwatch_log_groups')
        if log_groups:
            costs_by_step = get_costs(self.cloudwatch, self._db, log_groups, profile_id)
            add_cost_to_perf_profile_entries(self._db, costs_by_step)
            self.costs = round(sum(costs_by_step.values()), 4)
            self.logger.info(f'Total costs: ${self.costs}')

    def index(self, ds: Dataset):
        """Re-index all search results for the dataset.

        Args:
            ds: dataset to index
        """
        self._es.delete_ds(ds.id, delete_dataset=False)

        job_docs = self._db.select_with_fields(
            'SELECT id, moldb_id FROM job WHERE ds_id = %s', params=(ds.id,)
        )
        moldb_ids = ds.config['database_ids']
        for job_doc in job_docs:
            moldb = molecular_db.find_by_id(job_doc['moldb_id'])
            if job_doc['moldb_id'] not in moldb_ids:
                self._db.alter('DELETE FROM job WHERE id = %s', params=(job_doc['id'],))
            else:
                isocalc = IsocalcWrapper(ds.config)
                self._es.index_ds(ds_id=ds.id, moldb=moldb, isocalc=isocalc)

        ds.set_status(self._db, self._es, DatasetStatus.FINISHED)

    def update(self, ds, fields):
        try:
            self._es.update_ds(ds.id, fields)
        except elasticsearch.exceptions.ConflictError:
            # tries to write to elasticsearch one more time
            self.logger.info(f'Problem updating ES for: {ds.id}, trying again...')
            time.sleep(5)
            self._es.update_ds(ds.id, fields)

    def delete(self, ds):
        """Delete all dataset related data."""

        self.logger.info(f'Deleting dataset: {ds.id}')
        del_diagnostics(ds.id)
        del_jobs(ds)
        del_optical_image(self._db, ds.id)
        delete_ion_thumbnail(self._db, ds)
        self._es.delete_ds(ds.id)
        self._db.alter('DELETE FROM dataset WHERE id=%s', params=(ds.id,))

    def _send_email(self, email, subj, body):
        if not self._sm_config['services'].get('send_email', True):
            return

        try:
            resp = self.ses.send_email(
                Source='contact@metaspace2020.org',
                Destination={'ToAddresses': [email]},
                Message={'Subject': {'Data': subj}, 'Body': {'Text': {'Data': body}}},
            )
        except ClientError as e:
            self.logger.warning(f'Send email exception {e} for {email}')
        else:
            if resp['ResponseMetadata']['HTTPStatusCode'] == 200:
                self.logger.info(f'Email with "{subj}" subject was sent to {email}')
            else:
                self.logger.warning(f'SEM failed to send email to {email}')

    def send_success_email(self, msg):
        ds_name, _ = self.fetch_ds_metadata(msg['ds_id'])
        email_body = (
            'Dear METASPACE user,\n\n'
            f'Thank you for uploading the "{ds_name}" dataset to the METASPACE annotation service. '
            'We are pleased to inform you that the dataset has been processed and '
            f"is available at {msg['web_app_link']}.\n\n"
            'Best regards,\n'
            'METASPACE Team'
        )
        self._send_email(msg['email'], 'METASPACE service notification (SUCCESS)', email_body)

    def send_segmentation_success_email(self, msg):
        ds_name, _ = self.fetch_ds_metadata(msg['ds_id'])
        email_body = (
            'Dear METASPACE user,\n\n'
            f'Thank you for submitting the segmentation job for the "{ds_name}" dataset. '
            'We are pleased to inform you that the segmentation job has been been queued and '
            f"it will be processed shortly. You will receive an email when it is completed.\n\n"
            'Best regards,\n'
            'METASPACE Team'
        )
        self._send_email(msg['email'], 'METASPACE service notification (QUEUED)', email_body)

    def send_segmentation_failed_email(self, ds_id, email, error_msg):
        """Send failure email notification for segmentation jobs."""
        ds_name, _ = self.fetch_ds_metadata(ds_id)
        email_body = (
            'Dear METASPACE user,\n\n'
            f'We regret to inform you that the segmentation job for '
            f'the "{ds_name}" dataset has failed during data preparation. '
            f'Error details: {error_msg}\n\n'
            'This error occurred while preparing the data for segmentation analysis. '
            'Please check that your dataset has the required data (annotations, TIC image, etc.) '
            'and try again. If the problem persists, please contact our support team '
            'at contact@metaspace2020.org.\n\n'
            'Best regards,\n'
            'METASPACE Team'
        )
        self._send_email(email, 'METASPACE service notification (SEGMENTATION FAILED)', email_body)

    def send_failed_email(self, msg, traceback=None):
        ds_name, _ = self.fetch_ds_metadata(msg['ds_id'])
        content = (
            f'We are sorry to inform you that there was a problem '
            f'during processing of the "{ds_name}" dataset and it could not be annotated.'
        )
        if traceback:
            content += (
                f'\n\nWe could not successfully read the dataset\'s imzML or ibd file. '
                f'Please make sure you are using up-to-date software for '
                f'exporting the dataset to imzML/ibd format.\nIf you are a developer, '
                f'the following stack trace may be useful:\n\n{traceback}'
            )
        content += (
            '\n\nIf this is unexpected, please do not hesitate to contact us for support '
            'at contact@metaspace2020.org'
        )
        email_body = 'Dear METASPACE user,\n\n' f'{content}\n\n' 'Best regards,\n' 'METASPACE Team'
        self._send_email(msg['email'], 'METASPACE service notification (FAILED)', email_body)

    def run_segmentation(self, msg):  # pylint: disable=too-many-locals
        """Pick up a queued segmentation job and run it via the segmentation microservice."""

        ds_id = msg['ds_id']
        job_id = msg['job_id']
        algorithm = msg.get('algorithm', 'pca_gmm')
        database_ids = msg.get('database_ids', [])
        fdr = msg.get('fdr', 0.2)
        params = msg.get('params', {})
        adducts = msg.get('adducts')
        min_mz = msg.get('min_mz')
        max_mz = msg.get('max_mz')
        # None = no filter (off-sample classification may not exist)
        off_sample = msg.get('off_sample')

        daemon_start_time = time.time()
        self.logger.info(
            f'[SEGMENTATION_PERF] Daemon run_segmentation started for job {job_id}, dataset {ds_id}'
        )
        self.logger.info(f'Running segmentation job {job_id} for dataset {ds_id}')

        # Mark job as started
        db_update_start = time.time()
        self._db.alter(
            """UPDATE image_segmentation_job SET
             status = 'STARTED', updated_at = NOW() WHERE id = %s""",
            params=(job_id,),
        )
        db_update_time = time.time() - db_update_start
        self.logger.info(
            f'[SEGMENTATION_PERF] Job {job_id} marked as STARTED in {db_update_time:.3f}s'
        )

        try:
            submit_start_time = time.time()
            submit_segmentation_job(
                ds_id=ds_id,
                job_id=job_id,
                algorithm=algorithm,
                database_ids=database_ids,
                fdr=fdr,
                params=params,
                db=self._db,
                services_config=self._sm_config['services'],
                adducts=adducts,
                min_mz=min_mz,
                max_mz=max_mz,
                off_sample=off_sample,
            )
            submit_time = time.time() - submit_start_time
            total_daemon_time = time.time() - daemon_start_time
            self.logger.info(
                f"""[SEGMENTATION_PERF] Segmentation
                 job {job_id} submitted successfully"""
            )
            self.logger.info(
                f"""[SEGMENTATION_PERF] Submit time: {submit_time:.3f}s,
                 Total daemon time: {total_daemon_time:.3f}s"""
            )
        except Exception as e:
            # Don't propagate — a segmentation failure
            # should not change the dataset status to FAILED.
            # The job row already records the failure.
            failed_time = time.time() - daemon_start_time
            self.logger.error(
                f"""[SEGMENTATION_PERF] Segmentation job {job_id} for dataset {ds_id}
                 failed after {failed_time:.3f}s: {e}""",
                exc_info=True,
            )

            # Get submitter email for failure notification
            try:
                email_result = self._db.select_one(
                    'SELECT submitter_email FROM image_segmentation_job WHERE id = %s',
                    params=(job_id,),
                )
                submitter_email = email_result[0] if email_result and email_result[0] else None
            except Exception as email_err:
                self.logger.warning(
                    f'Failed to retrieve submitter email for job {job_id}: {email_err}'
                )
                submitter_email = None

            # Update job status in database
            self._db.alter(
                """UPDATE image_segmentation_job SET
                status = 'FAILED', error = %s, updated_at = NOW() WHERE id = %s""",
                params=(str(e), job_id),
            )

            # Send failure email notification if email is available
            if submitter_email:
                try:
                    self.send_segmentation_failed_email(ds_id, submitter_email, str(e))
                    self.logger.info(
                        f'Sent segmentation failure email to {submitter_email} for job {job_id}'
                    )
                except Exception as email_err:
                    self.logger.warning(
                        f'Failed to send failure email for job {job_id}: {email_err}'
                    )

    def ds_failure_handler(self, msg, e):
        self.logger.error(f' SM {msg["action"]} daemon: failure', exc_info=True)
        ds = self.load_ds(msg['ds_id'])
        self.set_ds_status(ds, status=DatasetStatus.FAILED)
        self.notify_update(ds.id, msg['action'], stage=DaemonActionStage.FAILED)
        slack_msg = f'{json.dumps(msg)}\n```{e.traceback}```'
        self.post_to_slack('hankey', f' [x] {msg["action"]} failed: {slack_msg}')
