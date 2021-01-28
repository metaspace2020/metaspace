import json
import logging
from traceback import format_exc

from sm.engine.daemons.actions import DaemonActionStage, DaemonAction
from sm.engine.dataset import DatasetStatus
from sm.engine.errors import ImzMLError, AnnotationError
from sm.engine.queue import QueueConsumer, QueuePublisher
from sm.engine.config import SMConfig
from sm.rest.dataset_manager import DatasetActionPriority


class LithopsDaemon:
    logger = logging.getLogger('lithops-daemon')

    def __init__(self, manager, lit_qdesc, upd_qdesc):
        self._sm_config = SMConfig.get_conf()
        self._stopped = False
        self._manager = manager
        self._lithops_queue_cons = QueueConsumer(
            config=self._sm_config['rabbitmq'],
            qdesc=lit_qdesc,
            logger=self.logger,
            poll_interval=1,
            callback=self._callback,
            on_success=self._on_success,
            on_failure=self._on_failure,
        )
        self._update_queue_pub = QueuePublisher(
            config=self._sm_config['rabbitmq'], qdesc=upd_qdesc, logger=self.logger
        )

    def _on_success(self, msg):
        self.logger.info(f" SM lithops daemon: success")
        self._manager.post_to_slack('dart', ' [v] Annotation succeeded: {}'.format(json.dumps(msg)))

    def _on_failure(self, msg, e):
        self._manager.ds_failure_handler(msg, e)

        if 'email' in msg:
            traceback = e.__cause__.traceback if isinstance(e.__cause__, ImzMLError) else None
            self._manager.send_failed_email(msg, traceback)

    def _callback(self, msg):
        try:
            self.logger.info(f" SM lithops daemon received a message: {msg}")
            self._manager.post_to_slack(
                'new', " [v] New annotation message: {}".format(json.dumps(msg))
            )

            ds = self._manager.load_ds(msg['ds_id'])
            self._manager.set_ds_status(ds, DatasetStatus.ANNOTATING)
            self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.STARTED)

            self._manager.annotate_lithops(ds=ds, del_first=msg.get('del_first', False))

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

            self._manager.set_ds_status(ds, DatasetStatus.FINISHED)
            self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.FINISHED)
        except Exception as e:
            raise AnnotationError(ds_id=msg['ds_id'], traceback=format_exc(chain=False)) from e

    def start(self):
        self._stopped = False
        self._lithops_queue_cons.start()

    def stop(self):
        if not self._stopped:
            self._lithops_queue_cons.stop()
            self._lithops_queue_cons.join()
            self._stopped = True
