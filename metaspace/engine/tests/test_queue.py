import time
import requests
from pytest import fixture
from queue import Queue
import logging

from sm.engine.queue import QueuePublisher, QueueConsumer, SM_ANNOTATE
from sm.engine.tests.util import sm_config


logging.basicConfig(level=logging.DEBUG)

QDESC = SM_ANNOTATE
QDESC['name'] = 'sm_test'


@fixture(scope='module')
def delete_queue(sm_config):
    # delete before tests
    queue_pub = QueuePublisher(sm_config['rabbitmq'], QDESC)
    queue_pub.delete_queue()

    yield
    # delete after tests
    queue_pub = QueuePublisher(sm_config['rabbitmq'], QDESC)
    queue_pub.delete_queue()


def run_queue_consumer_thread(config, callback, output_q, wait=1):
    queue_consumer = QueueConsumer(config, QDESC, callback,
                                   lambda *args: output_q.put('on_success'),
                                   lambda *args: output_q.put('on_failure'),
                                   poll_interval=0.1)
    queue_consumer.start()
    queue_consumer.stop()
    queue_consumer.join()


def queue_is_empty(config):
    resp = requests.get(url='http://localhost:15672/api/queues/%2F/{}'.format(QDESC['name']),
                        auth=(config['user'], config['password']), timeout=1)
    return resp.json()['messages'] == 0


def test_queue_msg_published_consumed_on_success_called(sm_config, delete_queue):
    config = sm_config['rabbitmq']
    queue_pub = QueuePublisher(config, QDESC)
    msg = {'test': 'message'}
    queue_pub.publish(msg)

    output_q = Queue()
    run_queue_consumer_thread(config, callback=lambda *args: output_q.put('callback'), output_q=output_q, wait=1)

    assert output_q.get() == 'callback'
    assert output_q.get() == 'on_success'
    assert output_q.empty()

    time.sleep(5)
    assert queue_is_empty(config)


def test_queue_msg_published_consumed_on_failure_called(sm_config):
    config = sm_config['rabbitmq']
    queue_pub = QueuePublisher(config, QDESC)
    msg = {'test': 'message'}
    queue_pub.publish(msg)

    output_q = Queue()

    def raise_exception(*args):
        output_q.put('callback')
        raise Exception('Callback exception')

    run_queue_consumer_thread(config, callback=raise_exception, output_q=output_q, wait=1)

    assert output_q.get() == 'callback'
    assert output_q.get() == 'on_failure'

    time.sleep(5)
    assert queue_is_empty(config)
