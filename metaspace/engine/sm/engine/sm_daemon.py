import json
import urllib.parse
from requests import post
import logging
import boto3

from sm.engine.dataset_manager import DatasetAction
from sm.engine.util import SMConfig, sm_log_config, init_logger
from sm.engine import QueueConsumer, ESExporter, QueuePublisher, Dataset, SearchJob
from sm.engine import DB

logger = logging.getLogger('sm-daemon')


class SMDaemon(object):

    def __init__(self, qname, DatasetManager):
        self.DatasetManager = DatasetManager
        self._qname = qname
        self._sm_queue_consumer = None
        self._sm_config = SMConfig.get_conf()
        self.stopped = False

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
        res = db.select_one('SELECT name, metadata FROM dataset WHERE id = %s', ds_id)
        return res or ('', {})

    def _send_email(self, email, subj, body):
        ses = boto3.client('ses', 'eu-west-1')
        resp = ses._send_email(
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
        ds_name, ds_meta = self._fetch_ds_metadata(msg['ds_id'])

        base_url = self._sm_config['services']['web_app_url']
        url_params = urllib.parse.quote(msg['ds_id'])
        msg['web_app_link'] = '{}/#/annotations?ds={}'.format(base_url, url_params)
        self._post_to_slack('dart', ' [v] Succeeded: {}'.format(json.dumps(msg)))

        if msg['action'] == DatasetAction.ADD and self._is_possible_send_email(ds_meta):
            submitter = ds_meta.get('Submitted_By', {}).get('Submitter', {})
            email_body = (
                'Dear {} {},\n\n'
                'Thank you for uploading dataset {} to the METASPACE annotation service. '
                'We are pleased to inform you that the dataset has been processed and is available at {}.\n\n'
                'Best regards,\n'
                'METASPACE Team\n\n'
                '---\n'
                'The online annotation engine is being developed as part of the METASPACE Horizon2020 project (grant number: 634402).'
            ).format(submitter.get('First_Name', ''), submitter.get('Surname', ''), ds_name, msg['web_app_link'])
            self._send_email(submitter['Email'], 'METASPACE service notification (SUCCESS)', email_body)

    def _on_failure(self, msg):
        self._post_to_slack('hankey', ' [x] Failed: {}'.format(json.dumps(msg)))
        ds_name, ds_meta = self._fetch_ds_metadata(msg['ds_id'])

        if msg['action'] == DatasetAction.ADD and self._is_possible_send_email(ds_meta):
            submitter = ds_meta['Submitted_By'].get('Submitter', '')
            email_body = (
                'Dear {} {},\n\n'
                'Thank you for uploading dataset "{}" to the METASPACE annotation service. '
                'We are sorry to inform you that there were issues with processing your dataset. '
                'We are already working on it. '
                'In case you have any questions, please do not hesitate to write us at contact@metaspace2020.eu\n\n'
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
            ds_man = self.DatasetManager(db, ESExporter(db), mode='queue',
                                         queue_publisher=QueuePublisher(self._sm_config['rabbitmq']))
            ds_man.process(ds=Dataset.load(db, msg['ds_id']),
                           action=msg['action'],
                           search_job_factory=SearchJob,
                           del_first=msg.get('del_first', False))
        finally:
            if db:
                db.close()

    def start(self):
        self.stopped = False
        self._sm_queue_consumer = QueueConsumer(self._sm_config['rabbitmq'], self._qname,
                                                self._callback, self._on_success, self._on_failure)
        self._sm_queue_consumer.run()  # starts IOLoop to block and allow pika handle events

    def stop(self):
        if not self.stopped:
            self._sm_queue_consumer.stop()
            self.stopped = True
