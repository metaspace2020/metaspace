import logging
import json
import os
import signal
from threading import Event, Thread
from time import sleep
import pika
from pika.exceptions import AMQPError


class StopThread(Exception):
    pass


class QueueConsumer(Thread):
    def __init__(
        self, config, qdesc, callback, on_success, on_failure, logger=None, poll_interval=1
    ):
        """Create a new instance of the blocking consumer class"""
        super().__init__()
        self._config = config
        self._heartbeat = 5 * 60 * 60  # 5h
        self._qdesc = qdesc
        self._qname = config.get('prefix', '') + self._qdesc['name']
        self._connection = None
        self._channel = None
        self._poll_interval = poll_interval
        self._stop_event = Event()

        self._callback = callback
        self._on_success = on_success
        self._on_failure = on_failure

        self._failed_attempts_limit = 5
        self._failed_attempts = 0
        self._reconnect_interval = 60

        self.logger = logger or logging.getLogger()

    def get_connect_url(self, hide_password=False):
        pwd = self._config['password'] if not hide_password else '***'
        return "amqp://{}:{}@{}:5672/%2F?heartbeat={}".format(
            self._config['user'], pwd, self._config['host'], self._heartbeat
        )

    def get_message(self):
        method, properties, body = self._channel.basic_get(queue=self._qname, auto_ack=False)
        if body is not None:
            msg = None
            try:
                body = body.decode('utf-8')
                self.logger.info(
                    ' [v] Received message # %s from %s: %s',
                    method.delivery_tag,
                    properties.app_id,
                    body,
                )
                msg = json.loads(body)

                if msg.get('action', None) == 'exit':
                    self.stop()
                    return

                self._callback(msg)
            except BaseException as e:
                self.logger.error(' [x] Failed: {}'.format(body), exc_info=False)
                try:
                    self._on_failure(msg or body, e)
                except BaseException:
                    self.logger.error(' [x] Failed in _on_failure: {}'.format(body), exc_info=True)
                    # Shut down the process, because this is likely an unrecoverable error
                    # e.g. a broken postgres connection or Lithops invoker
                    os.kill(os.getpid(), signal.SIGINT)
            else:
                self.logger.info(' [v] Succeeded: {}'.format(body))
                try:
                    self._on_success(msg)
                except BaseException:
                    self.logger.error(' [x] Failed in _on_success: {}'.format(body), exc_info=True)
            finally:
                self._channel.basic_ack(method.delivery_tag)

    def run(self):
        """Use `start` method to kick off message polling"""
        while self._failed_attempts < self._failed_attempts_limit:
            try:
                self._poll()
            except AMQPError as e:
                self._failed_attempts += 1
                self.logger.warning(
                    (
                        f' [x] Server disconnected: {e}. '
                        f'{self._failed_attempts} attempt to '
                        f'reconnect in {self._reconnect_interval} sec...'
                    )
                )
                sleep(self._reconnect_interval)
            except StopThread:
                self.logger.info(' [x] Stop signal received. Stopping')
                break

    def _poll(self):
        self.logger.info('Connecting to %s', self.get_connect_url(hide_password=True))
        self._connection = pika.BlockingConnection(pika.URLParameters(self.get_connect_url()))
        self._channel = self._connection.channel()
        self._channel.queue_declare(
            queue=self._qname, durable=self._qdesc['durable'], arguments=self._qdesc['arguments']
        )
        self.logger.info(' [*] Waiting for messages...')

        self._failed_attempts = 0

        while True:
            if self.stopped():
                raise StopThread()
            self.get_message()

            sleep(self._poll_interval)

    def stop(self):
        """After calling `stop`, method `join` must be called"""
        self._stop_event.set()

    def stopped(self):
        return self._stop_event.is_set()


class QueuePublisher:
    def __init__(self, config, qdesc, logger=None):
        creds = pika.PlainCredentials(config['user'], config['password'])
        self.qdesc = qdesc
        self.qname = config.get('prefix', '') + qdesc['name']
        self.conn_params = pika.ConnectionParameters(
            host=config['host'], credentials=creds, heartbeat=0
        )
        self.conn = None
        self.logger = logger if logger else logging.getLogger()

    def __str__(self):
        return '<QueuePublisher:{}>'.format(self.qname)

    def delete_queue(self):
        try:
            self.conn = pika.BlockingConnection(self.conn_params)
            channel = self.conn.channel()
            channel.queue_delete(queue=self.qname)
        except AMQPError as e:
            # pylint: disable=logging-too-many-args
            # False positive: pylint's type inference loses track of self.logger being a real
            # Logger through the `logger if logger else logging.getLogger()` ternary in
            # __init__ (confirmed: an explicit `self.logger: logging.Logger` annotation there
            # does not fix it either). Args match the two %s placeholders exactly.
            self.logger.error('Queue delete failed: %s - %s', self.qname, e)
        finally:
            if self.conn:
                self.conn.close()

    def publish(self, msg, priority=0):
        try:
            self.conn = pika.BlockingConnection(self.conn_params)
            channel = self.conn.channel()
            channel.queue_declare(
                queue=self.qname, durable=self.qdesc['durable'], arguments=self.qdesc['arguments']
            )
            channel.basic_publish(
                exchange='',
                routing_key=self.qname,
                body=json.dumps(msg),
                properties=pika.BasicProperties(
                    delivery_mode=2, priority=priority
                ),  # make message persistent
            )
            self.logger.info(" [v] Sent {} to {}".format(json.dumps(msg), self.qname))
        except AMQPError as e:
            # pylint: disable=logging-too-many-args
            # Same false positive as delete_queue() above - args match the two %s placeholders.
            self.logger.error('Failed to publish a message: %s - %s', msg, e)
        finally:
            if self.conn:
                self.conn.close()


SM_UPDATE = {'name': 'sm_update', 'durable': True, 'arguments': {'x-max-priority': 3}}
SM_LITHOPS = {'name': 'sm_lithops', 'durable': True, 'arguments': {'x-max-priority': 3}}
SM_DS_STATUS = {'name': 'sm_dataset_status', 'durable': True, 'arguments': None}
