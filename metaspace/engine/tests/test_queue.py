from threading import Thread
import time
from pytest import fixture
from unittest.mock import MagicMock

from sm.engine import QueuePublisher
from sm.engine.queue import QueueConsumer
from sm.engine.tests.util import sm_config

QNAME = 'sm_test'


@fixture
def clean_rabbitmq(sm_config):
    queue_pub = QueuePublisher(sm_config['rabbitmq'])
    queue_pub.queue_purge(QNAME)


def run_queue_consumer_thread(queue_consumer, wait=1):
    t = Thread(target=queue_consumer.run)
    t.start()
    time.sleep(wait)  # let rabbitmq deliver all messages
    queue_consumer.stop()
    t.join()


def test_queue_msg_published_consumed_on_success_called(sm_config):
    queue_pub = QueuePublisher(sm_config['rabbitmq'])
    msg = {'test': 'message'}
    queue_pub.publish(msg, qname=QNAME)

    callback = MagicMock()
    callback.side_effect = lambda *args: print('WITHIN CALLBACK: ', args)
    on_success = MagicMock()

    queue_consumer = QueueConsumer(sm_config['rabbitmq'], QNAME, callback, on_success, lambda *args: None)
    run_queue_consumer_thread(queue_consumer)

    callback.assert_called_once_with(msg)
    on_success.assert_called_once_with(msg)


def test_queue_msg_published_consumed_on_failure_called(sm_config):
    queue_pub = QueuePublisher(sm_config['rabbitmq'])
    msg = {'test': 'message'}
    queue_pub.publish(msg, qname=QNAME)

    def raise_exception(*args):
        raise Exception('Callback exception')

    callback = MagicMock()
    callback.side_effect = raise_exception
    on_failure = MagicMock()

    queue_consumer = QueueConsumer(sm_config['rabbitmq'], QNAME,
                                   callback, lambda *args: None, on_failure)
    run_queue_consumer_thread(queue_consumer)

    callback.assert_called_once_with(msg)
    on_failure.assert_called_once_with(msg)
