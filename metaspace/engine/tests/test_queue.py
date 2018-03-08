from threading import Thread
import time
from pytest import fixture
from unittest.mock import MagicMock

from sm.engine import QueuePublisher
from sm.engine.queue import QueueConsumer, SM_ANNOTATE
from sm.engine.tests.util import sm_config

QDESC = SM_ANNOTATE
QDESC['name'] = 'sm_test'


@fixture
def delete_queue(sm_config):
    queue_pub = QueuePublisher(sm_config['rabbitmq'], QDESC)
    queue_pub.delete_queue()


def run_queue_consumer_thread(queue_consumer, wait=1):
    t = Thread(target=queue_consumer.run)
    t.start()
    time.sleep(wait)  # let rabbitmq deliver all messages
    queue_consumer.stop()
    t.join()


def test_queue_msg_published_consumed_on_success_called(sm_config, delete_queue):
    queue_pub = QueuePublisher(sm_config['rabbitmq'], QDESC)
    msg = {'test': 'message'}
    queue_pub.publish(msg)

    callback = MagicMock()
    callback.side_effect = lambda *args: print('WITHIN CALLBACK: ', args)
    on_success = MagicMock()

    queue_consumer = QueueConsumer(sm_config['rabbitmq'], QDESC, callback, on_success, lambda *args: None)
    run_queue_consumer_thread(queue_consumer)

    callback.assert_called_once_with(msg)
    on_success.assert_called_once_with(msg)


def test_queue_msg_published_consumed_on_failure_called(sm_config):
    queue_pub = QueuePublisher(sm_config['rabbitmq'], QDESC)
    msg = {'test': 'message'}
    queue_pub.publish(msg)

    def raise_exception(*args):
        raise Exception('Callback exception')

    callback = MagicMock()
    callback.side_effect = raise_exception
    on_failure = MagicMock()

    queue_consumer = QueueConsumer(sm_config['rabbitmq'], QDESC,
                                   callback, lambda *args: None, on_failure)
    run_queue_consumer_thread(queue_consumer)

    callback.assert_called_once_with(msg)
    on_failure.assert_called_once_with(msg)
