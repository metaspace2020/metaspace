import sys
import pika
import signal
import logging
import json


class QueueConsumer(object):

    def __init__(self, config, qname, callback, on_success, on_failure):
        self.qname = qname
        self._callback = callback
        self._on_success = on_success
        self._on_failure = on_failure

        creds = pika.PlainCredentials(config['user'], config['password'])
        conn_params = pika.ConnectionParameters(host=config['host'], credentials=creds, heartbeat_interval=0)
        self._conn = pika.BlockingConnection(conn_params)
        self._ch = self._conn.channel()
        self._ch.queue_declare(queue=qname, durable=True)
        self._ch.basic_qos(prefetch_count=1)

        self.logger = logging.getLogger('sm-queue')

    def start_consuming(self):
        self._ch.basic_consume(self.on_message, queue=self.qname)
        self._ch.start_consuming()

    def on_message(self, ch, method, properties, body):
        self._ch.basic_ack(delivery_tag=method.delivery_tag)
        msg = json.loads(body.decode('utf-8'))
        try:
            self._callback(msg)
        except BaseException as e:
            self.logger.error(' [x] Failed: {}'.format(body))
            self.logger.error(e)
            self._on_failure(msg)
        else:
            self.logger.info(' [v] Finished: {}'.format(body))
            self._on_success(msg)

    def stop_consuming(self, signum, frame):
        self._ch.stop_consuming()
        self._conn.close()
        self.logger.info(' [v] Stopped consuming')
        sys.exit()

    def run(self):
        signal.signal(signal.SIGINT, self.stop_consuming)
        signal.signal(signal.SIGTERM, self.stop_consuming)

        self.logger.info(' [*] Waiting for messages...')
        self.start_consuming()


class QueuePublisher(object):

    def __init__(self, config):
        creds = pika.PlainCredentials(config['user'], config['password'])
        conn_params = pika.ConnectionParameters(host=config['host'], credentials=creds, heartbeat_interval=0)
        self._conn = pika.BlockingConnection(conn_params)
        self._ch = self._conn.channel()

        self.logger = logging.getLogger('sm-queue')

    def publish(self, msg, queue_name):
        self._ch.basic_publish(exchange='',
                               routing_key=queue_name,
                               body=json.dumps(msg),
                               properties=pika.BasicProperties(
                                   delivery_mode=2,  # make message persistent
                               ))
        self.logger.info(" [v] Sent {} to {}".format(json.dumps(msg), queue_name))

SM_ANNOTATE = 'sm_annotate'

SM_DS_STATUS = 'sm_dataset_status'
