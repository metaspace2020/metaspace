import json
import urllib.parse
from requests import post
import logging
import boto3

from sm.engine.dataset_manager import DatasetAction
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.queue import SM_DS_STATUS, QueueConsumer
from sm.engine.util import SMConfig, init_loggers
from sm.engine import ESExporter, QueuePublisher, Dataset, SearchJob
from sm.engine import DB

logger = logging.getLogger('daemon')


class SMDaemon(object):

    def __init__(self, qdesc, dataset_manager_factory, poll_interval=1):
        self._dataset_manager_factory = dataset_manager_factory
        self._sm_config = SMConfig.get_conf()
        self._stopped = False
        self._action_queue_consumer = QueueConsumer(config=self._sm_config['rabbitmq'], qdesc=qdesc,
                                                    callback=self._callback,
                                                    on_success=self._on_success,
                                                    on_failure=self._on_failure,
                                                    logger_name='daemon', poll_interval=poll_interval)

    def _post_to_slack(self, emoji, msg):
        slack_conf = SMConfig.get_conf().get('slack', {})

        if slack_conf.get('webhook_url', None):
            m = {"channel": slack_conf['channel'],
                 "username": "webhookbot",
                 "text": ":{}:{}".format(emoji, msg),
                 "icon_emoji": ":robot_face:"}
            post(slack_conf['webhook_url'], json=m)

    def _fetch_ds_metadata(self, ds_id):
        db = DB(SMConfig.get_conf()['db'])
        res = db.select_one('SELECT name, metadata FROM dataset WHERE id = %s', params=(ds_id,))
        return res or ('', {})

    def _send_email(self, email, subj, body):
        cred_dict = dict(aws_access_key_id=self._sm_config['aws']['aws_access_key_id'],
                         aws_secret_access_key=self._sm_config['aws']['aws_secret_access_key'])
        ses = boto3.client('ses', 'eu-west-1', **cred_dict)
        resp = ses.send_email(
            # Source='metaspace2020@gmail.com',
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
        if resp['ResponseMetadata']['HTTPStatusCode'] == 200:
            logger.info('Email with "{}" subject was sent to {}'.format(subj, email))
        else:
            logger.warning('SEM failed to send email to {}'.format(email))

    def _is_possible_send_email(self, ds_meta):
        submitter = ds_meta.get('Submitted_By', {}).get('Submitter', None)
        return (self._sm_config['services']['send_email']
                and submitter
                and 'Email' in submitter
                and ds_meta['metaspace_options'].get('notify_submitter', True))

    def _on_success(self, msg):
        if msg['action'] != DatasetAction.DELETE:
            ds_name, ds_meta = self._fetch_ds_metadata(msg['ds_id'])

            if msg['action'] == DatasetAction.ADD and self._is_possible_send_email(ds_meta):
                submitter = ds_meta.get('Submitted_By', {}).get('Submitter', {})
                md_type_quoted = urllib.parse.quote(ds_meta['Data_Type'])
                base_url = self._sm_config['services']['web_app_url']
                ds_id_quoted = urllib.parse.quote(msg['ds_id'])
                msg['web_app_link'] = '{}/#/annotations?mdtype={}&ds={}'.format(base_url, md_type_quoted, ds_id_quoted)
                email_body = (
                    'Dear {} {},\n\n'
                    'Thank you for uploading the "{}" dataset to the METASPACE annotation service. '
                    'We are pleased to inform you that the dataset has been processed and is available at {}.\n\n'
                    'Best regards,\n'
                    'METASPACE Team\n\n'
                    '---\n'
                    'The online annotation engine is being developed as part of the METASPACE Horizon2020 project (grant number: 634402).'
                ).format(submitter.get('First_Name', ''), submitter.get('Surname', ''), ds_name, msg['web_app_link'])
                self._send_email(submitter['Email'], 'METASPACE service notification (SUCCESS)', email_body)

        self._post_to_slack('dart', ' [v] Succeeded: {}'.format(json.dumps(msg)))

    def _on_failure(self, msg):
        self._post_to_slack('hankey', ' [x] Failed: {}'.format(json.dumps(msg)))
        ds_name, ds_meta = self._fetch_ds_metadata(msg['ds_id'])

        if msg['action'] == DatasetAction.ADD and self._is_possible_send_email(ds_meta):
            submitter = ds_meta['Submitted_By'].get('Submitter', '')
            email_body = (
                'Dear {} {},\n\n'
                'Thank you for uploading the "{}" dataset to the METASPACE annotation service. '
                'We are sorry to inform you that there was a problem during processing of this dataset '
                'and it could not be annotated. '
                'If this is unexpected, please do not hesitate to contact us for support at contact@metaspace2020.eu\n\n'
                'Best regards,\n'
                'METASPACE Team\n\n'
                '---\n'
                'The online annotation engine is being developed as part of the METASPACE Horizon2020 project (grant number: 634402).'
            ).format(submitter.get('First_Name', ''), submitter.get('Surname', ''), ds_name)
            self._send_email(submitter['Email'], 'METASPACE service notification (FAILED)', email_body)

    def _callback(self, msg):
        log_msg = " SM daemon received a message: {}".format(msg)
        logger.info(log_msg)
        self._post_to_slack('new', " [v] Received: {}".format(json.dumps(msg)))

        db = DB(self._sm_config['db'])
        try:
            ds_man = self._dataset_manager_factory(
                db=db, es=ESExporter(db),
                img_store=ImageStoreServiceWrapper(self._sm_config['services']['img_service_url']),
                mode='queue',
                status_queue=QueuePublisher(config=self._sm_config['rabbitmq'],
                                            qdesc=SM_DS_STATUS,
                                            logger=logger)
            )
            ds_man.process(ds=Dataset.load(db, msg['ds_id']),
                           action=msg['action'],
                           search_job_factory=SearchJob,
                           del_first=msg.get('del_first', False))
        finally:
            if db:
                db.close()

    def start(self):
        self._stopped = False
        self._action_queue_consumer.start()

    def stop(self):
        if not self._stopped:
            self._action_queue_consumer.stop()
            self._action_queue_consumer.join()
            self._stopped = True
