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
        log_msg = " [v] Received: {}".format(body)
        self.logger.info(log_msg)
        try:
            self._callback(json.loads(body))
        except BaseException as e:
            log_msg = ' [x] Failed: {}'.format(body)
            self.logger.error(log_msg)
            self._on_failure(log_msg)
        else:
            log_msg = ' [v] Finished: {}'.format(body)
            self.logger.info(log_msg)
            self._on_success(log_msg)

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

    def __init__(self, config, qname):
        self.qname = qname

        creds = pika.PlainCredentials(config['user'], config['password'])
        conn_params = pika.ConnectionParameters(host=config['host'], credentials=creds, heartbeat_interval=0)
        self._conn = pika.BlockingConnection(conn_params)
        self._ch = self._conn.channel()

        self.logger = logging.getLogger('sm-queue')

    def publish(self, msg):
        self._ch.basic_publish(exchange='',
                               routing_key=self.qname,
                               body=json.dumps(msg),
                               properties=pika.BasicProperties(
                                   delivery_mode=2,  # make message persistent
                               ))
        self.logger.info(" [v] Sent {} to {}".format(json.dumps(msg), self.qname))
