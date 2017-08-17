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

        self.logger = logging.getLogger('sm-daemon')

        self._connection = None
        self._channel = None
        self._closing = False
        self._consumer_tag = None
        self._url = "amqp://{}:{}@{}:5672/%2F".format(config['user'], config['password'], config['host'])

        # creds = pika.PlainCredentials()
        # conn_params = pika.ConnectionParameters(host=, credentials=creds, heartbeat_interval=0)
        # self._conn = pika.BlockingConnection(conn_params)
        # self._conn = pika.SelectConnection(conn_params)
        # self._ch = self._conn.channel()
        # self._ch.queue_declare(queue=qname, durable=True, arguments={'x-max-priority': 3})
        # self._ch.basic_qos(prefetch_count=1)
        # self._consumer_tag = None

    def _connect(self):
        """This method connects to RabbitMQ, returning the connection handle.
        When the connection is established, the on_connection_open method
        will be invoked by pika.

        :rtype: pika.SelectConnection
        """
        self.logger.info('Connecting to %s', self._url)
        return pika.SelectConnection(pika.URLParameters(self._url),
                                     self._on_connection_open,
                                     stop_ioloop_on_close=False)

    def _on_connection_open(self, unused_connection):
        """This method is called by pika once the connection to RabbitMQ has
        been established. It passes the handle to the connection object in
        case we need it, but in this case, we'll just mark it unused.

        :type unused_connection: pika.SelectConnection
        """
        self.logger.info('Connection opened')
        # self.add_on_connection_close_callback()
        self._open_channel()

    def _open_channel(self):
        """Open a new channel with RabbitMQ by issuing the Channel.Open RPC
        command. When RabbitMQ responds that the channel is open, the
        on_channel_open callback will be invoked by pika.
        """
        self.logger.info('Creating a new channel')
        self._connection.channel(on_open_callback=self._on_channel_open)

    def _on_channel_open(self, channel):
        """This method is invoked by pika when the channel has been opened.
        The channel object is passed in so we can make use of it.
        Since the channel is now open, we'll declare the exchange to use.

        :param pika.channel.Channel channel: The channel object
        """
        self.logger.info('Channel opened')
        self._channel = channel
        self._setup_queue(self.qname)
        self._add_on_channel_close_callback()
        # self.setup_exchange(self.EXCHANGE)

    def _setup_queue(self, queue_name):
        """Setup the queue on RabbitMQ by invoking the Queue.Declare RPC
        command. When it is complete, the on_queue_declareok method will
        be invoked by pika.

        :param str|unicode queue_name: The name of the queue to declare.
        """
        self.logger.info('Declaring queue %s', queue_name)
        self._channel.queue_declare(self._on_queue_declareok, queue_name)

    def _on_queue_declareok(self, method_frame):
        """Method invoked by pika when the Queue.Declare RPC call made in
        setup_queue has completed. In this method we will bind the queue
        and exchange together with the routing key by issuing the Queue.Bind
        RPC command. When this command is complete, the on_bindok method will
        be invoked by pika.

        :param pika.frame.Method method_frame: The Queue.DeclareOk frame
        """
        self.logger.info('')
        self._start_consuming()

    def _start_consuming(self):
        """This method sets up the consumer by first calling
        add_on_cancel_callback so that the object is notified if RabbitMQ
        cancels the consumer. It then issues the Basic.Consume RPC command
        which returns the consumer tag that is used to uniquely identify the
        consumer with RabbitMQ. We keep the value to use it when we want to
        cancel consuming. The on_message method is passed in as a callback pika
        will invoke when a message is fully received.
        """
        self._add_on_cancel_callback()
        self._consumer_tag = self._channel.basic_consume(self._on_message, self.qname)

    def _add_on_channel_close_callback(self):
        """This method tells pika to call the on_channel_closed method if
        RabbitMQ unexpectedly closes the channel.
        """
        self.logger.info('Adding channel close callback')
        self._channel.add_on_close_callback(self._on_channel_closed)

    def _on_channel_closed(self, channel, reply_code, reply_text):
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

    def _add_on_cancel_callback(self):
        """Add a callback that will be invoked if RabbitMQ cancels the consumer
        for some reason. If RabbitMQ does cancel the consumer,
        on_consumer_cancelled will be invoked by pika.
        """
        self.logger.info('Adding consumer cancellation callback')
        self._channel.add_on_cancel_callback(self._on_consumer_cancelled)

    def _on_consumer_cancelled(self, method_frame):
        """Invoked by pika when RabbitMQ sends a Basic.Cancel for a consumer
        receiving messages.

        :param pika.frame.Method method_frame: The Basic.Cancel frame
        """
        self.logger.info('Consumer was cancelled remotely, shutting down: %r', method_frame)
        if self._channel:
            self._channel.close()

    def _on_message(self, _ch, basic_deliver, properties, body):
        self.logger.info('Received message # %s from %s: %s',
                    basic_deliver.delivery_tag, properties.app_id, body)
        self._channel.basic_ack(delivery_tag=basic_deliver.delivery_tag)
        msg = None
        try:
            msg = json.loads(body.decode('utf-8'))
            self._callback(msg)
        except BaseException as e:
            self.logger.error(' [x] Failed: {}'.format(body))
            self.logger.error(e)
            self._on_failure(msg or body)
        else:
            self.logger.info(' [v] Finished: {}'.format(body))
            self._on_success(msg)

    def stop(self):
        """Tell RabbitMQ that you would like to stop consuming by sending the
        Basic.Cancel RPC command.
        """
        if self._channel:
            self.logger.info('Sending a Basic.Cancel RPC command to RabbitMQ')
            self._channel.basic_cancel(self._on_cancelok, self._consumer_tag)

    def _on_cancelok(self, unused_frame):
        """This method is invoked by pika when RabbitMQ acknowledges the
        cancellation of a consumer. At this point we will close the channel.
        This will invoke the on_channel_closed method once the channel has been
        closed, which will in-turn close the connection.

        :param pika.frame.Method unused_frame: The Basic.CancelOk frame
        """
        self.logger.info('RabbitMQ acknowledged the cancellation of the consumer')
        self._channel.close()

    def start(self):
        """Start consumer by connecting to RabbitMQ and then
        starting the IOLoop to block and allow the SelectConnection to operate.
        """
        self._connection = self._connect()
        self._connection.ioloop.start()

    # def _stop_consuming(self, signum, frame):
    #     self._ch.stop_consuming()
    #     self._conn.close()
    #     self.logger.info(' [v] Stopped consuming')
    #     sys.exit()

    # def start(self):
    #     if current_thread() == main_thread():
    #         signal.signal(signal.SIGINT, self._stop_consuming)
    #         signal.signal(signal.SIGTERM, self._stop_consuming)
    #
    #     self.logger.info(' [*] Waiting for messages...')
    #     self._start_consuming()


class QueuePublisher(object):

    def __init__(self, config):
        creds = pika.PlainCredentials(config['user'], config['password'])
        conn_params = pika.ConnectionParameters(host=config['host'], credentials=creds, heartbeat_interval=0)
        self._conn = pika.BlockingConnection(conn_params)
        self._ch = self._conn.channel()

        self.logger = logging.getLogger('sm-queue')

    def publish(self, msg, qname, priority=0):
        self._ch.basic_publish(exchange='',
                               routing_key=qname,
                               body=json.dumps(msg),
                               properties=pika.BasicProperties(
                                   delivery_mode=2,  # make message persistent
                                   priority=priority
                               ))
        self.logger.info(" [v] Sent {} to {}".format(json.dumps(msg), qname))

SM_ANNOTATE = 'sm_annotate'

SM_DS_STATUS = 'sm_dataset_status'
