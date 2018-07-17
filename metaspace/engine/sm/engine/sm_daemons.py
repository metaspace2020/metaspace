import json
import urllib.parse
from requests import post
import logging
import boto3

from sm.rest.dataset_manager import IMG_URLS_BY_ID_SEL
from sm.engine.errors import UnknownDSID
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.mol_db import MolecularDB
from sm.engine.queue import SM_DS_STATUS, QueueConsumer
from sm.engine.util import SMConfig
from sm.engine.queue import QueuePublisher
from sm.engine.dataset import Dataset, DatasetStatus
from sm.engine.db import DB
from sm.engine.work_dir import WorkDirManager
from sm.engine.search_job import SearchJob


class SMDaemonManager(object):

    def __init__(self, db, es, img_store, status_queue=None, logger=None, sm_config=None):
        self._sm_config = sm_config or SMConfig.get_conf()
        self._slack_conf = self._sm_config.get('slack', {})
        self._db = db
        self.es = es
        self._img_store = img_store
        self.status_queue = status_queue
        self.logger = logger or logging.getLogger()

    def post_to_slack(self, emoji, msg):
        if self._slack_conf.get('webhook_url', None):
            m = {"channel": self._slack_conf['channel'],
                 "username": "webhookbot",
                 "text": ":{}:{}".format(emoji, msg),
                 "icon_emoji": ":robot_face:"}
            post(self._slack_conf['webhook_url'], json=m)

    def fetch_ds_metadata(self, ds_id):
        res = self._db.select_one('SELECT name, metadata FROM dataset WHERE id = %s', params=(ds_id,))
        return res or ('', {})

    def create_web_app_link(self, msg):
        link = None
        try:
            ds_name, ds_meta = self.fetch_ds_metadata(msg['ds_id'])
            md_type_quoted = urllib.parse.quote(ds_meta['Data_Type'])
            base_url = self._sm_config['services']['web_app_url']
            ds_id_quoted = urllib.parse.quote(msg['ds_id'])
            link = '{}/#/annotations?mdtype={}&ds={}'.format(base_url, md_type_quoted, ds_id_quoted)
        except Exception as e:
            self.logger.error(e)
        return link

    def annotate(self, ds, search_job_factory=None, del_first=False):
        """ Run an annotation job for the dataset. If del_first provided, delete first
        """
        if del_first:
            self.logger.warning('Deleting all results for dataset: {}'.format(ds.id))
            self._del_iso_images(ds)
            # self._es.delete_ds(ds.id)
            self._db.alter('DELETE FROM job WHERE ds_id=%s', params=(ds.id,))
        ds.save(self._db, self.es)
        search_job_factory(img_store=self._img_store).run(ds)

    def _finished_job_moldbs(self, ds_id):
        for job_id, mol_db_id in self._db.select('SELECT id, db_id FROM job WHERE ds_id = %s', params=(ds_id,)):
            yield job_id, MolecularDB(id=mol_db_id).name

    def index(self, ds):
        """ Reindex all dataset results """
        self.es.delete_ds(ds.id)

        for job_id, mol_db_name in self._finished_job_moldbs(ds.id):
            if mol_db_name not in ds.mol_dbs:
                self._db.alter('DELETE FROM job WHERE id = %s', params=(job_id,))
            else:
                mol_db = MolecularDB(name=mol_db_name,
                                     iso_gen_config=ds.config['isotope_generation'])
                isocalc = IsocalcWrapper(ds.config['isotope_generation'])
                self.es.index_ds(ds_id=ds.id, mol_db=mol_db, isocalc=isocalc)

    def _del_iso_images(self, ds):
        self.logger.info('Deleting isotopic images: (%s, %s)', ds.id, ds.name)

        try:
            storage_type = ds.get_ion_img_storage_type(self._db)
            for row in self._db.select(IMG_URLS_BY_ID_SEL, params=(ds.id,)):
                iso_image_ids = row[0]
                for img_id in iso_image_ids:
                    if img_id:
                        self._img_store.delete_image_by_id(storage_type, 'iso_image', img_id)
        except UnknownDSID:
            self.logger.warning('Attempt to delete isotopic images of non-existing dataset. Skipping')

    def delete(self, ds, del_raw_data=False, **kwargs):
        """ Delete all dataset related data from the DB """
        self.logger.warning('Deleting dataset: {}'.format(ds.id))
        self._del_iso_images(ds)
        # TODO: delete optical images
        self.es.delete_ds(ds.id)
        self._db.alter('DELETE FROM dataset WHERE id=%s', params=(ds.id,))
        if del_raw_data:
            self.logger.warning('Deleting raw data: {}'.format(ds.input_path))
            wd_man = WorkDirManager(ds.id)
            wd_man.del_input_data(ds.input_path)

        self.status_queue.publish({'ds_id': ds.id, 'status': DatasetStatus.DELETED})


class SMAnnotateDaemon(object):
    """ Reads messages from annotation queue and starts annotation jobs
    """
    logger = logging.getLogger('annotate-daemon')

    def __init__(self, manager, annot_qdesc, upd_qdesc, poll_interval=1):
        self._sm_config = SMConfig.get_conf()
        self._stopped = False
        self._annot_queue_consumer = QueueConsumer(config=self._sm_config['rabbitmq'], qdesc=annot_qdesc,
                                                   callback=self._callback,
                                                   on_success=self._on_success,
                                                   on_failure=self._on_failure,
                                                   logger=self.logger, poll_interval=poll_interval)
        self._upd_queue_pub = QueuePublisher(config=self._sm_config['rabbitmq'],
                                             qdesc=upd_qdesc,
                                             logger=self.logger)

        self._db = DB(self._sm_config['db'])
        self._manager = manager

    def _send_email(self, email, subj, body):
        try:
            cred_dict = dict(aws_access_key_id=self._sm_config['aws']['aws_access_key_id'],
                             aws_secret_access_key=self._sm_config['aws']['aws_secret_access_key'])
            ses = boto3.client('ses', 'eu-west-1', **cred_dict)
            resp = ses.send_email(
                Source='contact@metaspace2020.eu',
                Destination={
                    'ToAddresses': [email]
                },
                Message={
                    'Subject': {
                        'Data': subj
                    },
                    'Body': {
                        'Text': {
                            'Data': body
                        }
                    }
                }
            )
        except Exception as e:
            self.logger.warning(f'Send email exception {e} for {email}')
        else:
            if resp['ResponseMetadata']['HTTPStatusCode'] == 200:
                self.logger.info(f'Email with "{subj}" subject was sent to {email}')
            else:
                self.logger.warning(f'SEM failed to send email to {email}')

    def _on_success(self, msg):
        ds = Dataset.load(self._db, msg['ds_id'])
        ds.set_status(self._db, self._manager.es, self._manager.status_queue, DatasetStatus.FINISHED)

        self.logger.info(f" SM annotate daemon: success")

        ds_name, _ = self._manager.fetch_ds_metadata(msg['ds_id'])
        msg['web_app_link'] = self._manager.create_web_app_link(msg)
        self._manager.post_to_slack('dart', ' [v] Annotation succeeded: {}'.format(json.dumps(msg)))

        if msg.get('email'):
            email_body = (
                'Dear METASPACE user,\n\n'
                'Thank you for uploading the "{}" dataset to the METASPACE annotation service. '
                'We are pleased to inform you that the dataset has been processed and is available at {}.\n\n'
                'Best regards,\n'
                'METASPACE Team'
            ).format(ds_name, msg['web_app_link'])
            self._send_email(msg['email'], 'METASPACE service notification (SUCCESS)', email_body)

    def _on_failure(self, msg):
        ds = Dataset.load(self._db, msg['ds_id'])
        ds.set_status(self._db, self._manager.es, self._manager.status_queue, DatasetStatus.FAILED)

        self.logger.error(f" SM annotate daemon: failure", exc_info=True)

        ds_name, _ = self._manager.fetch_ds_metadata(msg['ds_id'])
        msg['web_app_link'] = self._manager.create_web_app_link(msg)
        self._manager.post_to_slack('hankey', ' [x] Annotation failed: {}'.format(json.dumps(msg)))

        if msg.get('email'):
            email_body = (
                'Dear METASPACE user,\n\n'
                'We are sorry to inform you that there was a problem during processing of the "{}" dataset '
                'and it could not be annotated. '
                'If this is unexpected, please do not hesitate to contact us for support at contact@metaspace2020.eu\n\n'
                'Best regards,\n'
                'METASPACE Team'
            ).format(ds_name)
            self._send_email(msg['email'], 'METASPACE service notification (FAILED)', email_body)

    def _callback(self, msg):
        ds = Dataset.load(self._db, msg['ds_id'])
        ds.set_status(self._db, self._manager.es, self._manager.status_queue, DatasetStatus.ANNOTATING)

        self.logger.info(f" SM annotate daemon received a message: {msg}")
        self._manager.post_to_slack('new', " [v] New annotation message: {}".format(json.dumps(msg)))

        self._manager.annotate(ds=ds,
                               search_job_factory=SearchJob,
                               del_first=msg.get('del_first', False))

        upd_msg = {
            'ds_id': msg['ds_id'],
            'ds_name': msg['ds_name'],
            'action': 'update'
        }
        self._upd_queue_pub.publish(msg=upd_msg, priority=2)

    def start(self):
        self._stopped = False
        self._annot_queue_consumer.start()

    def stop(self):
        if not self._stopped:
            self._annot_queue_consumer.stop()
            self._annot_queue_consumer.join()
            self._stopped = True
        if self._db:
            self._db.close()


class SMUpdateDaemon(object):
    """ Reads messages from update queue and does updates/deletes
    """
    logger = logging.getLogger('update-daemon')

    def __init__(self, manager, update_qdesc, poll_interval=1):
        self._manager = manager
        self._sm_config = SMConfig.get_conf()
        self._db = DB(self._sm_config['db'])
        self._update_queue_cons = QueueConsumer(config=self._sm_config['rabbitmq'],
                                                qdesc=update_qdesc,
                                                callback=self._callback,
                                                on_success=self._on_success,
                                                on_failure=self._on_failure,
                                                logger=self.logger,
                                                poll_interval=poll_interval)
        self._status_queue_pub = QueuePublisher(config=self._sm_config['rabbitmq'],
                                                qdesc=SM_DS_STATUS,
                                                logger=self.logger)
        self._stopped = False

    def _post_to_slack(self, msg):
        if msg['action'] == 'update':
            msg['web_app_link'] = self._manager.create_web_app_link(msg)
            self._manager.post_to_slack('dart', f' [v] Update succeeded: {json.dumps(msg)}')
        elif msg['action'] == 'delete':
            self._manager.post_to_slack('dart', f' [v] Delete succeeded: {json.dumps(msg)}')

    def _on_success(self, msg):
        ds = Dataset.load(self._db, msg['ds_id'])
        ds.set_status(self._db, self._manager.es, self._manager.status_queue, DatasetStatus.FINISHED)

        self.logger.info(f" SM update daemon: success")
        self._post_to_slack(msg)

    def _on_failure(self, msg):
        ds = Dataset.load(self._db, msg['ds_id'])
        ds.set_status(self._db, self._manager.es, self._manager.status_queue, DatasetStatus.FAILED)

        self.logger.error(f" SM update daemon: failure", exc_info=True)
        self._post_to_slack(msg)

    def _callback(self, msg):
        ds = Dataset.load(self._db, msg['ds_id'])
        ds.set_status(self._db, self._manager.es, self._manager.status_queue, DatasetStatus.INDEXING)

        self.logger.info(f' SM update daemon received a message: {msg}')
        self._manager.post_to_slack('new', f" [v] New {msg['action']} message: {json.dumps(msg)}")

        if msg['action'] == 'update':
            self._manager.index(ds=ds)
        elif msg['action'] == 'delete':
            self._manager.delete(ds=ds)
        else:
            raise Exception(f"Wrong action: {msg['action']}")

    def start(self):
        self._stopped = False
        self._update_queue_cons.start()

    def stop(self):
        if not self._stopped:
            self._update_queue_cons.stop()
            self._update_queue_cons.join()
            self._stopped = True
        if self._db:
            self._db.close()
