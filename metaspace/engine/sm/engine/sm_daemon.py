import json
from requests import post
import logging
import boto3

from sm.engine.util import SMConfig, sm_log_formatters, sm_log_config, init_logger
from sm.engine import QueueConsumer, SMDaemonDatasetManager, ESExporter, QueuePublisher, Dataset, SearchJob
from sm.engine import DB
from sm.engine.queue import SM_ANNOTATE


def configure_loggers():
    log_config = sm_log_config
    log_config['loggers']['sm-engine']['handlers'] = ['console_warn', 'file']
    init_logger(log_config)


configure_loggers()
logger = logging.getLogger('sm-daemon')


class SMDaemon(object):

    def __init__(self, qname, DatasetManager):
        self.DatasetManager = DatasetManager
        self._qname = qname
        self._sm_queue_consumer = None
        self._sm_config = SMConfig.get_conf()

    def post_to_slack(self, emoji, msg):
        slack_conf = SMConfig.get_conf()['slack']

        if slack_conf:
            m = {"channel": slack_conf['channel'],
                 "username": "webhookbot",
                 "text": ":{}:{}".format(emoji, msg),
                 "icon_emoji": ":robot_face:"}
            post(slack_conf['webhook_url'], json=m)

    def fetch_ds_metadata(self, ds_id):
        db = DB(SMConfig.get_conf()['db'])
        return db.select_one('SELECT name, metadata FROM dataset WHERE id = %s', ds_id)

    def send_email(self, email, subj, body):
        ses = boto3.client('ses', 'eu-west-1')
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

    def is_possible_send_email(self, ds_meta):
        submitter = ds_meta.get('Submitted_By', {}).get('Submitter', None)
        sm_config = SMConfig.get_conf()
        return (sm_config['services']['send_email']
                and submitter
                and 'Email' in submitter
                and ds_meta['metaspace_options'].get('notify_submitter', True))

    def on_job_succeeded(self, msg):
        ds_name, ds_meta = self.fetch_ds_metadata(msg['ds_id'])

        sm_config = SMConfig.get_conf()
        base_url = sm_config['services']['web_app_url']
        import urllib.parse
        url_params = urllib.parse.quote(msg['ds_id'])
        msg['web_app_link'] = '{}/#/annotations?ds={}'.format(base_url, url_params)
        self.post_to_slack('dart', ' [v] Finished: {}'.format(json.dumps(msg)))

        if self.is_possible_send_email(ds_meta):
            submitter = ds_meta.get('Submitted_By', {}).get('Submitter', '')
            email_body = (
                'Dear {} {},\n\n'
                'Thank you for uploading dataset {} to the METASPACE annotation service. '
                'We are pleased to inform you that the dataset has been processed and is available at {}.\n\n'
                'Best regards,\n'
                'METASPACE Team\n\n'
                '---\n'
                'The online annotation engine is being developed as part of the METASPACE Horizon2020 project (grant number: 634402).'
            ).format(submitter.get('First_Name', ''), submitter.get('Surname', ''), ds_name, msg['web_app_link'])
            self.send_email(submitter['Email'],
                       'METASPACE service notification (SUCCESS)',
                       email_body)

    def on_job_failed(self, msg):
        self.post_to_slack('hankey', ' [x] Failed: {}'.format(json.dumps(msg)))

        ds_name, ds_meta = self.fetch_ds_metadata(msg['ds_id'])
        submitter = ds_meta['Submitted_By'].get('Submitter', '')

        if self.is_possible_send_email(ds_meta):
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
            self.send_email(submitter['Email'],
                       'METASPACE service notification (FAILED)',
                       email_body)

    def callback(self, msg):
        log_msg = " [v] Received: {}".format(msg)
        logger.info(log_msg)
        self.post_to_slack('new', " [v] Received: {}".format(json.dumps(msg)))

        db = DB(self._sm_config['db'])
        try:
            ds_man = self.DatasetManager(db, ESExporter(db), mode='queue',
                                         queue_publisher=QueuePublisher(self._sm_config['rabbitmq']))
            ds_man.process(ds=Dataset.load(db, msg['ds_id']),
                           action=msg['action'],
                           search_job=SearchJob())
        finally:
            if db:
                db.close()

    def start(self):
        self._sm_queue_consumer = QueueConsumer(self._sm_config['rabbitmq'], self._qname,
                                                self.callback, self.on_job_succeeded, self.on_job_failed)
        self._sm_queue_consumer.run()

    def stop(self):
        self._sm_queue_consumer.stop()
