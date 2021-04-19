import json
import logging
from pathlib import Path
from traceback import format_exc

import redis

from sm.engine.daemons.actions import DaemonActionStage, DaemonAction
from sm.engine.dataset import DatasetStatus
from sm.engine.errors import ImzMLError, AnnotationError
from sm.engine.queue import QueueConsumer, QueuePublisher
from sm.engine.config import SMConfig
from sm.rest.dataset_manager import DatasetActionPriority


class SMAnnotateDaemon:
    """Reads messages from annotation queue and starts annotation jobs"""

    logger = logging.getLogger('annotate-daemon')

    def __init__(self, manager, annot_qdesc, upd_qdesc, poll_interval=1):
        self._sm_config = SMConfig.get_conf()
        self._stopped = False
        self._manager = manager
        self._annot_queue_consumer = QueueConsumer(
            config=self._sm_config['rabbitmq'],
            qdesc=annot_qdesc,
            callback=self._callback,
            on_success=self._on_success,
            on_failure=self._on_failure,
            logger=self.logger,
            poll_interval=poll_interval,
        )
        self._update_queue_pub = QueuePublisher(
            config=self._sm_config['rabbitmq'], qdesc=upd_qdesc, logger=self.logger
        )
        self._redis_client = redis.Redis(**self._sm_config.get('redis', {}))
        Path(self._sm_config['fs']['spark_data_path']).mkdir(parents=True, exist_ok=True)

    def _on_success(self, msg):
        self.logger.info(' SM annotate daemon: success')

        ds = self._manager.load_ds(msg['ds_id'])
        self._manager.set_ds_status(ds, DatasetStatus.FINISHED)
        self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.FINISHED)

        self._manager.post_to_slack('dart', ' [v] Annotation succeeded: {}'.format(json.dumps(msg)))
        self._redis_client.set('cluster-busy', 'no')

    def _on_failure(self, msg, e):
        self._manager.ds_failure_handler(msg, e)

        if 'email' in msg:
            traceback = e.__cause__.traceback if isinstance(e.__cause__, ImzMLError) else None
            self._manager.send_failed_email(msg, traceback)
        self._redis_client.set('cluster-busy', 'no')

    def _callback(self, msg):
        try:
            self.logger.info(f' SM annotate daemon received a message: {msg}')
            self._redis_client.set('cluster-busy', 'yes', ex=3600 * 13)  # key expires in 13h

            ds = self._manager.load_ds(msg['ds_id'])
            self._manager.set_ds_status(ds, DatasetStatus.ANNOTATING)
            self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.STARTED)

            self._manager.post_to_slack('new', f' [v] New annotation message: {json.dumps(msg)}')

            self._manager.annotate(ds=ds, del_first=msg.get('del_first', False))

            update_msg = {
                'ds_id': msg['ds_id'],
                'ds_name': msg['ds_name'],
                'email': msg.get('email', None),
                'action': DaemonAction.INDEX,
            }
            self._update_queue_pub.publish(msg=update_msg, priority=DatasetActionPriority.HIGH)

            if self._sm_config['services'].get('off_sample', False):
                analyze_msg = {
                    'ds_id': msg['ds_id'],
                    'ds_name': msg['ds_name'],
                    'action': DaemonAction.CLASSIFY_OFF_SAMPLE,
                }
                self._update_queue_pub.publish(msg=analyze_msg, priority=DatasetActionPriority.LOW)
        except Exception as e:
            raise AnnotationError(ds_id=msg['ds_id'], traceback=format_exc(chain=False)) from e

    def start(self):
        self._stopped = False
        self._annot_queue_consumer.start()

    def stop(self):
        """Must be called from main thread"""
        if not self._stopped:
            self._annot_queue_consumer.stop()
            self._annot_queue_consumer.join()
            self._stopped = True

    def join(self):
        if not self._stopped:
            self._annot_queue_consumer.join()
