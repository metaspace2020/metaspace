import json
import logging
from traceback import format_exc
import urllib.parse
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
import redis
from requests import post

from sm.engine.annotation.job import del_jobs
from sm.engine.annotation_lithops.annotation_job import ServerAnnotationJob
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.colocalization import Colocalization
from sm.engine.daemon_action import DaemonAction, DaemonActionStage
from sm.engine.dataset import Dataset, DatasetStatus
from sm.engine.db import DB
from sm.engine.errors import AnnotationError, ImzMLError, IndexUpdateError, SMError, UnknownDSID
from sm.engine.es_export import ESExporter
from sm.engine.ion_thumbnail import generate_ion_thumbnail, generate_ion_thumbnail_lithops
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine import molecular_db
from sm.engine.off_sample_wrapper import classify_dataset_ion_images
from sm.engine.optical_image import del_optical_image
from sm.engine.queue import QueueConsumer, QueuePublisher
from sm.engine.util import SMConfig
from sm.engine.utils.perf_profile import perf_profile
from sm.rest.dataset_manager import DatasetActionPriority
from sm.engine.annotation_spark.annotation_job import AnnotationJob


class DatasetManager:
    def __init__(self, db, es, img_store, status_queue=None, logger=None, sm_config=None):
        self._sm_config = sm_config or SMConfig.get_conf()
        self._slack_conf = self._sm_config.get('slack', {})
        self._db: DB = db
        self._es: ESExporter = es
        self._img_store = img_store
        self._status_queue = status_queue
        self.logger = logger or logging.getLogger()

        self.ses = boto3.client(
            'ses',
            'eu-west-1',
            aws_access_key_id=self._sm_config['aws']['aws_access_key_id'],
            aws_secret_access_key=self._sm_config['aws']['aws_secret_access_key'],
        )

    def post_to_slack(self, emoji, msg):
        if self._slack_conf.get('webhook_url', None):
            m = {
                "channel": self._slack_conf['channel'],
                "username": "webhookbot",
                "text": ":{}:{}".format(emoji, msg),
                "icon_emoji": ":robot_face:",
            }
            post(self._slack_conf['webhook_url'], json=m)

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
            link = '{}/annotations?mdtype={}&ds={}'.format(base_url, md_type_quoted, ds_id_quoted)
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
        """ Run an annotation job for the dataset. If del_first provided, delete first
        """
        if del_first:
            self.logger.warning(f'Deleting all results for dataset: {ds.id}')
            del_jobs(ds)
        ds.save(self._db, self._es)
        with perf_profile(self._db, 'annotate_spark', ds.id) as perf:
            AnnotationJob(
                img_store=self._img_store, ds=ds, sm_config=self._sm_config, perf=perf
            ).run()

            if self._sm_config['services'].get('colocalization', True):
                Colocalization(self._db, self._img_store).run_coloc_job(ds, reprocess=del_first)
                perf.record_entry('ran colocalization')

            if self._sm_config['services'].get('ion_thumbnail', True):
                generate_ion_thumbnail(
                    db=self._db, img_store=self._img_store, ds=ds, only_if_needed=not del_first
                )
                perf.record_entry('generated ion thumbnail')

    def annotate_lithops(self, ds: Dataset, del_first=False):
        if del_first:
            self.logger.warning(f'Deleting all results for dataset: {ds.id}')
            del_jobs(ds)
        ds.save(self._db, self._es)
        with perf_profile(self._db, 'annotate_lithops', ds.id) as perf:
            executor = Executor(self._sm_config['lithops'], perf=perf)

            ServerAnnotationJob(executor, self._img_store, ds, perf).run()

            if self._sm_config['services'].get('colocalization', True):
                Colocalization(self._db, self._img_store).run_coloc_job_lithops(
                    executor, ds, reprocess=del_first
                )

            if self._sm_config['services'].get('ion_thumbnail', True):
                generate_ion_thumbnail_lithops(
                    executor=executor,
                    db=self._db,
                    sm_config=self._sm_config,
                    ds=ds,
                    only_if_needed=not del_first,
                )

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
        self._es.update_ds(ds.id, fields)

    def delete(self, ds):
        """ Delete all dataset related data from the DB """
        self.logger.info(f'Deleting dataset: {ds.id}')
        del_jobs(ds)
        del_optical_image(self._db, self._img_store, ds.id)
        self._es.delete_ds(ds.id)
        self._db.alter('DELETE FROM dataset WHERE id=%s', params=(ds.id,))

    def _send_email(self, email, subj, body):
        if not self._sm_config['services'].get('send_email', True):
            return

        try:
            resp = self.ses.send_email(
                Source='contact@metaspace2020.eu',
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

    def send_failed_email(self, msg, traceback=None):
        ds_name, _ = self.fetch_ds_metadata(msg['ds_id'])
        content = (
            f'We are sorry to inform you that there was a problem '
            f'during processing of the "{ds_name}" dataset and it could not be annotated.'
        )
        if traceback:
            content += (
                f"\n\nWe could not successfully read the dataset's imzML file. "
                f'Please make sure you are using up-to-date software for '
                f'exporting the dataset to imzML format.\nIf you are a developer, '
                f'the following stack trace may be useful:\n\n{traceback}'
            )
        content += (
            '\n\nIf this is unexpected, please do not hesitate to contact us for support '
            'at contact@metaspace2020.eu'
        )
        email_body = 'Dear METASPACE user,\n\n' f'{content}\n\n' 'Best regards,\n' 'METASPACE Team'
        self._send_email(msg['email'], 'METASPACE service notification (FAILED)', email_body)

    def ds_failure_handler(self, msg, e):
        self.logger.error(f" SM {msg['action']} daemon: failure", exc_info=True)
        ds = self.load_ds(msg['ds_id'])
        self.set_ds_status(ds, status=DatasetStatus.FAILED)
        self.notify_update(ds.id, msg['action'], stage=DaemonActionStage.FAILED)
        slack_msg = f'{json.dumps(msg)}\n```{e.traceback}```'
        self.post_to_slack('hankey', f" [x] {msg['action']} failed: {slack_msg}")


class SMAnnotateDaemon:
    """ Reads messages from annotation queue and starts annotation jobs
    """

    logger = logging.getLogger('annotate-daemon')

    def __init__(self, manager, annot_qdesc, upd_qdesc, poll_interval=1):
        self._sm_config = SMConfig.get_conf()
        self._stopped = False
        self._manager = manager
        self._annot_queue_consumer = QueueConsumer(
            config=self._sm_config['rabbitmq'],
            qdesc=annot_qdesc,
            callback=self._callback,
            on_success=self._on_success,
            on_failure=self._on_failure,
            logger=self.logger,
            poll_interval=poll_interval,
        )
        self._update_queue_pub = QueuePublisher(
            config=self._sm_config['rabbitmq'], qdesc=upd_qdesc, logger=self.logger
        )
        self._redis_client = redis.Redis(**self._sm_config.get('redis', {}))
        Path(self._sm_config['fs']['spark_data_path']).mkdir(parents=True, exist_ok=True)

    def _on_success(self, msg):
        self.logger.info(f" SM annotate daemon: success")

        ds = self._manager.load_ds(msg['ds_id'])
        self._manager.set_ds_status(ds, DatasetStatus.FINISHED)
        self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.FINISHED)

        self._manager.post_to_slack('dart', ' [v] Annotation succeeded: {}'.format(json.dumps(msg)))
        self._redis_client.set('cluster-busy', 'no')

    def _on_failure(self, msg, e):
        self._manager.ds_failure_handler(msg, e)

        if 'email' in msg:
            traceback = e.__cause__.traceback if isinstance(e.__cause__, ImzMLError) else None
            self._manager.send_failed_email(msg, traceback)
        self._redis_client.set('cluster-busy', 'no')

    def _callback(self, msg):
        try:
            self.logger.info(f" SM annotate daemon received a message: {msg}")
            self._redis_client.set('cluster-busy', 'yes', ex=3600 * 13)  # key expires in 13h

            ds = self._manager.load_ds(msg['ds_id'])
            self._manager.set_ds_status(ds, DatasetStatus.ANNOTATING)
            self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.STARTED)

            self._manager.post_to_slack(
                'new', " [v] New annotation message: {}".format(json.dumps(msg))
            )

            self._manager.annotate(ds=ds, del_first=msg.get('del_first', False))

            update_msg = {
                'ds_id': msg['ds_id'],
                'ds_name': msg['ds_name'],
                'email': msg.get('email', None),
                'action': DaemonAction.INDEX,
            }
            self._update_queue_pub.publish(msg=update_msg, priority=DatasetActionPriority.HIGH)

            if self._sm_config['services'].get('off_sample', False):
                analyze_msg = {
                    'ds_id': msg['ds_id'],
                    'ds_name': msg['ds_name'],
                    'action': DaemonAction.CLASSIFY_OFF_SAMPLE,
                }
                self._update_queue_pub.publish(msg=analyze_msg, priority=DatasetActionPriority.LOW)
        except Exception as e:
            raise AnnotationError(ds_id=msg['ds_id'], traceback=format_exc(chain=False)) from e

    def start(self):
        self._stopped = False
        self._annot_queue_consumer.start()

    def stop(self):
        """  Must be called from main thread
        """
        if not self._stopped:
            self._annot_queue_consumer.stop()
            self._annot_queue_consumer.join()
            self._stopped = True


class SMIndexUpdateDaemon:
    """ Reads messages from the update queue and does indexing/update/delete
    """

    logger = logging.getLogger('update-daemon')

    def __init__(self, manager, make_update_queue_cons):
        self._manager = manager
        self._update_queue_cons = make_update_queue_cons(
            callback=self._callback, on_success=self._on_success, on_failure=self._on_failure
        )
        self._stopped = False

    def _on_success(self, msg):
        self.logger.info(f" SM update daemon: success")

        if msg['action'] == DaemonAction.DELETE:
            self._manager.notify_update(
                msg['ds_id'], action=DaemonAction.DELETE, stage=DaemonActionStage.FINISHED
            )
        else:
            ds = self._manager.load_ds(msg['ds_id'])
            if msg['action'] == DaemonAction.INDEX:
                self._manager.set_ds_status(ds, DatasetStatus.FINISHED)
            self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.FINISHED)

        if msg['action'] in [DaemonAction.UPDATE, DaemonAction.INDEX]:
            msg['web_app_link'] = self._manager.create_web_app_link(msg)

        if msg['action'] != DaemonAction.UPDATE:
            self._manager.post_to_slack(
                'dart', f" [v] Succeeded to {msg['action']}: {json.dumps(msg)}"
            )

        if msg.get('email'):
            self._manager.send_success_email(msg)

    def _on_failure(self, msg, e):
        self._manager.ds_failure_handler(msg, e)

        if 'email' in msg:
            self._manager.send_failed_email(msg)

    def _callback(self, msg):
        try:
            self.logger.info(f' SM update daemon received a message: {msg}')
            self._manager.post_to_slack(
                'new', f" [v] New {msg['action']} message: {json.dumps(msg)}"
            )

            ds = self._manager.load_ds(msg['ds_id'])
            self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.STARTED)

            if msg['action'] == DaemonAction.INDEX:
                self._manager.index(ds=ds)

            elif msg['action'] == DaemonAction.CLASSIFY_OFF_SAMPLE:
                try:
                    # depending on number of annotations may take up to several minutes
                    self._manager.classify_dataset_images(ds)
                except Exception as e:  # don't fail dataset when off-sample pred fails
                    self.logger.warning(f'Failed to classify off-sample: {e}')

                try:
                    self._manager.index(ds=ds)
                except UnknownDSID:
                    # Sometimes the DS will have been deleted before this point
                    self.logger.warning(f'DS missing after off-sample classification: {ds.id}')

            elif msg['action'] == DaemonAction.UPDATE:
                self._manager.update(ds, msg['fields'])
            elif msg['action'] == DaemonAction.DELETE:
                self._manager.delete(ds=ds)
            else:
                raise SMError(f"Wrong action: {msg['action']}")
        except Exception as e:
            raise IndexUpdateError(msg['ds_id'], traceback=format_exc(chain=False)) from e

    def start(self):
        self._stopped = False
        self._update_queue_cons.start()

    def stop(self):
        if not self._stopped:
            self._update_queue_cons.stop()
            self._update_queue_cons.join()
            self._stopped = True
