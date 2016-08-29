import sys
import pika
import signal
import logging
import json


class Queue(object):

    def __init__(self, config, qname):
        self.qname = qname
        creds = pika.PlainCredentials(config['user'], config['password'])
        self.conn = pika.BlockingConnection(pika.ConnectionParameters(host=config['host'], credentials=creds))

        self.ch = self.conn.channel()
        self.ch.queue_declare(queue=qname, durable=True)
        self.ch.basic_qos(prefetch_count=1)

        self.logger = logging.getLogger('sm-queue')

    def start_consuming(self, callback):
        self.ch.basic_consume(callback, queue=self.qname)

        def stop_consuming(signum, frame):
            self.ch.stop_consuming()
            self.logger.info(' [v] Stopped consuming')
            sys.exit()

        signal.signal(signal.SIGINT, stop_consuming)
        signal.signal(signal.SIGTERM, stop_consuming)

        self.logger.info(' [*] Waiting for messages...')
        self.ch.start_consuming()

    def publish(self, msg):
        self.ch.basic_publish(exchange='',
                              routing_key=self.qname,
                              body=json.dumps(msg),
                              properties=pika.BasicProperties(
                                  delivery_mode=2,  # make message persistent
                              ))
        self.logger.info(" [v] Sent {} to {}".format(json.dumps(msg), self.qname))
        self.conn.close()
