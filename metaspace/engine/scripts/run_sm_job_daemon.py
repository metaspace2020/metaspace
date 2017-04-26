#!/usr/bin/env python
import argparse
import json
from requests import post
import logging
import boto3

from sm.engine.util import SMConfig, sm_log_formatters, sm_log_config, init_logger
from sm.engine.search_job import SearchJob
from sm.engine.queue import QueueConsumer
from sm.engine.db import DB


def configure_loggers():
    log_config = sm_log_config
    log_config['loggers']['sm-engine']['handlers'] = ['console_warn', 'file']
    init_logger(log_config)


def post_to_slack(emoji, msg):
    slack_conf = SMConfig.get_conf()['slack']

    if slack_conf['webhook_url']:
        m = {"channel": slack_conf['channel'],
             "username": "webhookbot",
             "text": ":{}:{}".format(emoji, msg),
             "icon_emoji": ":robot_face:"}
        post(slack_conf['webhook_url'], json=m)


def fetch_ds_metadata(ds_id):
    db = DB(SMConfig.get_conf()['db'])
    return db.select_one('SELECT name, metadata FROM dataset WHERE id = %s', ds_id)


def send_email(email, subj, body):
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
        logger.warn('SEM failed to send email to {}'.format(email))


def on_job_succeeded(msg):
    ds_name, ds_meta = fetch_ds_metadata(msg['ds_id'])

    base_url = SMConfig.get_conf()['services']['web_app_url']
    import urllib
    url_params = urllib.quote(msg['ds_id'])
    msg['web_app_link'] = '{}/#/annotations?ds={}'.format(base_url, url_params)
    post_to_slack('dart', ' [v] Finished: {}'.format(json.dumps(msg)))

    submitter = ds_meta['Submitted_By'].get('Submitter', '')

    if 'Email' in submitter and ds_meta['metaspace_options'].get('notify_submitter', True):
        email_body = (
            'Dear {} {},\n\n'
            'Thank you for uploading dataset {} to the METASPACE annotation service. '
            'We are pleased to inform you that the dataset has been processed and is available at {}.\n\n'
            'Best regards,\n'
            'METASPACE Team\n\n'
            '---\n'
            'The online annotation engine is being developed as part of the METASPACE Horizon2020 project (grant number: 634402).'
        ).format(submitter.get('First_Name', ''), submitter.get('Surname', ''), ds_name, msg['web_app_link'])
        send_email(submitter['Email'],
                   'METASPACE service notification (SUCCESS)',
                   email_body)


def on_job_failed(msg):
    post_to_slack('hankey', ' [x] Failed: {}'.format(json.dumps(msg)))

    ds_name, ds_meta = fetch_ds_metadata(msg['ds_id'])
    submitter = ds_meta['Submitted_By'].get('Submitter', '')

    if 'Email' in submitter and ds_meta['metaspace_options'].get('notify_submitter', True):
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
        send_email(submitter['Email'],
                   'METASPACE service notification (FAILED)',
                   email_body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=('Daemon for reading messages from the '
                                                  'queue and starting annotation jobs'))
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')

    args = parser.parse_args()
    SMConfig.set_path(args.sm_config_path)
    rabbit_config = SMConfig.get_conf()['rabbitmq']

    configure_loggers()
    logger = logging.getLogger('sm-queue')

    def run_job_callback(msg):
        log_msg = " [v] Received: {}".format(msg)
        logger.info(log_msg)
        post_to_slack('new', " [v] Received: {}".format(json.dumps(msg)))
        job = SearchJob(msg['ds_id'], args.sm_config_path)
        job.run()

    annotation_queue = QueueConsumer(rabbit_config, 'sm_annotate',
                                     run_job_callback, on_job_succeeded, on_job_failed)
    annotation_queue.run()
