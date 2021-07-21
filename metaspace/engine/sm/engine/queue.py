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


# pylint: disable=too-many-instance-attributes,unused-argument,too-many-public-methods
# pylint: disable=logging-format-interpolation,logging-too-many-args
class QueueConsumerAsync:
    """This is an example consumer that will handle unexpected interactions
    with RabbitMQ such as channel and connection closures.

    If RabbitMQ closes the connection, it will reopen it. You should
    look at the output, as there are limited reasons why the connection may
    be closed, which usually are tied to permission related issues or
    socket timeouts.

    If the channel is closed, it will indicate a problem with one of the
    commands that were issued and that should surface in the output as well.
    """

    def __init__(self, config, qdesc, callback, on_success, on_failure, logger_name):
        """Create a new instance of the consumer class, passing in the AMQP
        URL used to connect to RabbitMQ.

        :param str amqp_url: The AMQP url to connect with

        """
        self.exchange = 'sm'  # default exchange ("") cannot be used here
        self.exchange_type = 'direct'
        self.routing_key = None
        self._qdesc = qdesc
        self._qname = self._qdesc['name']
        self._no_ack = False  # messages get redelivered with no_ack=False
        self._heartbeat = 3 * 60 * 60  # 3h
        self._reopen_timeout = 2

        self._callback = callback
        self._on_success = on_success
        self._on_failure = on_failure

        self.logger = logging.getLogger(logger_name)

        self._connection = None
        self._channel = None
        self._closing = False
        self._consumer_tag = None
        self._url = "amqp://{}:{}@{}:5672/%2F?heartbeat={}".format(
            config['user'], config['password'], config['host'], self._heartbeat
        )

    def connect(self):
        """This method connects to RabbitMQ, returning the connection handle.
        When the connection is established, the on_connection_open method
        will be invoked by pika.

        :rtype: pika.SelectConnection

        """
        self.logger.info('Connecting to %s', self._url)
        return pika.SelectConnection(
            pika.URLParameters(self._url), self.on_connection_open, stop_ioloop_on_close=False
        )

    def on_connection_open(self, unused_connection):
        """This method is called by pika once the connection to RabbitMQ has
        been established. It passes the handle to the connection object in
        case we need it, but in this case, we'll just mark it unused.

        :type unused_connection: pika.SelectConnection

        """
        self.logger.info('Connection opened')
        self.add_on_connection_close_callback()
        self.open_channel()

    def add_on_connection_close_callback(self):
        """This method adds an on close callback that will be invoked by pika
        when RabbitMQ closes the connection to the publisher unexpectedly.

        """
        self.logger.info('Adding connection close callback')
        self._connection.add_on_close_callback(self.on_connection_closed)

    def on_connection_closed(self, connection, reply_code, reply_text):
        """This method is invoked by pika when the connection to RabbitMQ is
        closed unexpectedly. Since it is unexpected, we will reconnect to
        RabbitMQ if it disconnects.

        :param pika.connection.Connection connection: The closed connection obj
        :param int reply_code: The server provided reply_code if given
        :param str reply_text: The server provided reply_text if given

        """
        self._channel = None
        if self._closing:
            self._connection.ioloop.stop()
        else:
            self.logger.warning(
                'Connection closed, reopening in %s seconds: (%s) %s',
                self._reopen_timeout,
                reply_code,
                reply_text,
            )
            self._connection.add_timeout(self._reopen_timeout, self.reconnect)

    def reconnect(self):
        """Will be invoked by the IOLoop timer if the connection is
        closed. See the on_connection_closed method.

        """
        # This is the old connection IOLoop instance, stop its ioloop
        self._connection.ioloop.stop()

        if not self._closing:
            # Create a new connection
            self._connection = self.connect()

            # There is now a new connection, needs a new ioloop to run
            self._connection.ioloop.start()

    def open_channel(self):
        """Open a new channel with RabbitMQ by issuing the Channel.Open RPC
        command. When RabbitMQ responds that the channel is open, the
        on_channel_open callback will be invoked by pika.

        """
        self.logger.info('Creating a new channel')
        self._connection.channel(on_open_callback=self.on_channel_open)

    def on_channel_open(self, channel):
        """This method is invoked by pika when the channel has been opened.
        The channel object is passed in so we can make use of it.

        Since the channel is now open, we'll declare the exchange to use.

        :param pika.channel.Channel channel: The channel object

        """
        self.logger.info('Channel opened')
        self._channel = channel
        self.add_on_channel_close_callback()
        self._channel.basic_qos(prefetch_count=1)
        self.setup_exchange(self.exchange)

    def add_on_channel_close_callback(self):
        """This method tells pika to call the on_channel_closed method if
        RabbitMQ unexpectedly closes the channel.

        """
        self.logger.info('Adding channel close callback')
        self._channel.add_on_close_callback(self.on_channel_closed)

    def on_channel_closed(self, channel, reply_code, reply_text):
        """Invoked by pika when RabbitMQ unexpectedly closes the channel.
        Channels are usually closed if you attempt to do something that
        violates the protocol, such as re-declare an exchange or queue with
        different parameters. In this case, we'll close the connection
        to shutdown the object.

        :param pika.channel.Channel: The closed channel
        :param int reply_code: The numeric reason the channel was closed
        :param str reply_text: The text reason the channel was closed

        """
        self.logger.warning('Channel %i was closed: (%s) %s', channel, reply_code, reply_text)
        self._connection.close()

    def setup_exchange(self, exchange_name):
        """Setup the exchange on RabbitMQ by invoking the Exchange.Declare RPC
        command. When it is complete, the on_exchange_declareok method will
        be invoked by pika.

        :param str|unicode exchange_name: The name of the exchange to declare

        """
        self.logger.info('Declaring exchange %s', exchange_name)
        self._channel.exchange_declare(
            self.on_exchange_declareok, exchange_name, self.exchange_type
        )

    def on_exchange_declareok(self, unused_frame):
        """Invoked by pika when RabbitMQ has finished the Exchange.Declare RPC
        command.

        :param pika.Frame.Method unused_frame: Exchange.DeclareOk response frame

        """
        self.logger.info('Exchange declared')
        self.setup_queue(self._qname)

    def setup_queue(self, queue_name):
        """Setup the queue on RabbitMQ by invoking the Queue.Declare RPC
        command. When it is complete, the on_queue_declareok method will
        be invoked by pika.

        :param str|unicode queue_name: The name of the queue to declare.

        """
        self.logger.info('Declaring queue %s', queue_name)
        self._channel.queue_declare(
            self.on_queue_declareok,
            queue_name,
            durable=self._qdesc['durable'],
            arguments=self._qdesc['arguments'],
        )

    def on_queue_declareok(self, method_frame):
        """Method invoked by pika when the Queue.Declare RPC call made in
        setup_queue has completed. In this method we will bind the queue
        and exchange together with the routing key by issuing the Queue.Bind
        RPC command. When this command is complete, the on_bindok method will
        be invoked by pika.

        :param pika.frame.Method method_frame: The Queue.DeclareOk frame

        """
        self.logger.info('Binding %s to %s with %s', self.exchange, self._qname, self.routing_key)
        self._channel.queue_bind(self.on_bindok, self._qname, self.exchange, self.routing_key)

    def on_bindok(self, unused_frame):
        """Invoked by pika when the Queue.Bind method has completed. At this
        point we will start consuming messages by calling start_consuming
        which will invoke the needed RPC commands to start the process.

        :param pika.frame.Method unused_frame: The Queue.BindOk response frame

        """
        self.logger.info('Queue bound')
        self.start_consuming()

    def start_consuming(self):
        """This method sets up the consumer by first calling
        add_on_cancel_callback so that the object is notified if RabbitMQ
        cancels the consumer. It then issues the Basic.Consume RPC command
        which returns the consumer tag that is used to uniquely identify the
        consumer with RabbitMQ. We keep the value to use it when we want to
        cancel consuming. The on_message method is passed in as a callback pika
        will invoke when a message is fully received.

        """
        self.logger.info('Issuing consumer related RPC commands')
        self.add_on_cancel_callback()
        self.logger.info(' [*] Waiting for messages...')
        self._consumer_tag = self._channel.basic_consume(
            self.on_message, self._qname, no_ack=self._no_ack, exclusive=True
        )

    def add_on_cancel_callback(self):
        """Add a callback that will be invoked if RabbitMQ cancels the consumer
        for some reason. If RabbitMQ does cancel the consumer,
        on_consumer_cancelled will be invoked by pika.

        """
        self.logger.info('Adding consumer cancellation callback')
        self._channel.add_on_cancel_callback(self.on_consumer_cancelled)

    def on_consumer_cancelled(self, method_frame):
        """Invoked by pika when RabbitMQ sends a Basic.Cancel for a consumer
        receiving messages.

        :param pika.frame.Method method_frame: The Basic.Cancel frame

        """
        self.logger.info('Consumer was cancelled remotely, shutting down: %r', method_frame)
        if self._channel:
            self._channel.close()

    def on_message(self, unused_channel, basic_deliver, properties, body):
        """Invoked by pika when a message is delivered from RabbitMQ. The
        channel is passed for your convenience. The basic_deliver object that
        is passed in carries the exchange, routing key, delivery tag and
        a redelivered flag for the message. The properties passed in is an
        instance of BasicProperties with the message properties and the body
        is the message that was sent.

        :param pika.channel.Channel unused_channel: The channel object
        :param pika.Spec.Basic.Deliver: basic_deliver method
        :param pika.Spec.BasicProperties: properties
        :param str|byte body: The message body

        """
        msg = None
        try:
            self.acknowledge_message(basic_deliver.delivery_tag)
            body = body.decode('utf-8')
            self.logger.info(
                ' [v] Received message # %s from %s: %s',
                basic_deliver.delivery_tag,
                properties.app_id,
                body,
            )

            msg = json.loads(body)
            self._callback(msg)
        except Exception:
            self.logger.error(' [x] Failed: {}'.format(body), exc_info=True)
            self._on_failure(msg or body)
        else:
            self.logger.info(' [v] Succeeded: {}'.format(body))
            self._on_success(msg)

    def acknowledge_message(self, delivery_tag):
        """Acknowledge the message delivery from RabbitMQ by sending a
        Basic.Ack RPC method for the delivery tag.

        :param int delivery_tag: The delivery tag from the Basic.Deliver frame

        """
        self.logger.info('Acknowledging message %s', delivery_tag)
        self._channel.basic_ack(delivery_tag)

    def stop_consuming(self):
        """Tell RabbitMQ that you would like to stop consuming by sending the
        Basic.Cancel RPC command.

        """
        if self._channel:
            self.logger.info('Sending a Basic.Cancel RPC command to RabbitMQ')
            self._channel.basic_cancel(self.on_cancelok, self._consumer_tag)

    def on_cancelok(self, unused_frame):
        """This method is invoked by pika when RabbitMQ acknowledges the
        cancellation of a consumer. At this point we will close the channel.
        This will invoke the on_channel_closed method once the channel has been
        closed, which will in-turn close the connection.

        :param pika.frame.Method unused_frame: The Basic.CancelOk frame

        """
        self.logger.info('RabbitMQ acknowledged the cancellation of the consumer')
        self.close_channel()

    def close_channel(self):
        """Call to close the channel with RabbitMQ cleanly by issuing the
        Channel.Close RPC command.

        """
        self.logger.info('Closing the channel')
        self._channel.close()

    def run(self):
        """Run the example consumer by connecting to RabbitMQ and then
        starting the IOLoop to block and allow the SelectConnection to operate.

        """
        self._connection = self.connect()
        self._connection.ioloop.start()

    def stop(self):
        """Cleanly shutdown the connection to RabbitMQ by stopping the consumer
        with RabbitMQ. When RabbitMQ confirms the cancellation, on_cancelok
        will be invoked by pika, which will then closing the channel and
        connection. The IOLoop is started again because this method is invoked
        when CTRL-C is pressed raising a KeyboardInterrupt exception. This
        exception stops the IOLoop which needs to be running for pika to
        communicate with RabbitMQ. All of the commands issued prior to starting
        the IOLoop will be buffered but not processed.

        """
        self.logger.info('Stopping')
        self._closing = True
        self.stop_consuming()
        self._connection.ioloop.start()
        self.logger.info(' [v] Stopped consuming')

    def close_connection(self):
        """This method closes the connection to RabbitMQ."""
        self.logger.info('Closing connection')
        self._connection.close()


class QueueConsumer(Thread):
    def __init__(
        self, config, qdesc, callback, on_success, on_failure, logger=None, poll_interval=1
    ):
        """Create a new instance of the blocking consumer class"""
        super().__init__()
        self._config = config
        self._heartbeat = 3 * 60 * 60  # 3h
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
        method, properties, body = self._channel.basic_get(queue=self._qname, no_ack=False)
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
        """ Use `start` method to kick off message polling """
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

        while True:
            if self.stopped():
                raise StopThread()
            self.get_message()
            self._failed_attempts = 0
            sleep(self._poll_interval)

    def stop(self):
        """ After calling `stop`, method `join` must be called"""
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
            channel.queue_delete(self.qname)
        except AMQPError as e:
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
            self.logger.error('Failed to publish a message: %s - %s', msg, e)
        finally:
            if self.conn:
                self.conn.close()


SM_ANNOTATE = {'name': 'sm_annotate', 'durable': True, 'arguments': {'x-max-priority': 3}}
SM_UPDATE = {'name': 'sm_update', 'durable': True, 'arguments': {'x-max-priority': 3}}
SM_LITHOPS = {'name': 'sm_lithops', 'durable': True, 'arguments': {'x-max-priority': 3}}
SM_DS_STATUS = {'name': 'sm_dataset_status', 'durable': True, 'arguments': None}
