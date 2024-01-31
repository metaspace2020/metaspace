import json
import logging
import os
import signal
from traceback import format_exc

from sm.engine.annotation_lithops.executor import LithopsStalledException
from sm.engine.config import SMConfig
from sm.engine.daemons.actions import DaemonActionStage, DaemonAction
from sm.engine.dataset import DatasetStatus
from sm.engine.errors import AnnotationError, ImzMLError
from sm.engine.queue import QueueConsumer, QueuePublisher
from sm.rest.dataset_manager import DatasetActionPriority


class LithopsDaemon:
    logger = logging.getLogger('lithops-daemon')

    def __init__(self, manager, lit_qdesc, annot_qdesc, upd_qdesc):
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
        self._lithops_queue_pub = QueuePublisher(
            config=self._sm_config['rabbitmq'], qdesc=lit_qdesc, logger=self.logger
        )
        self._annot_queue_pub = QueuePublisher(
            config=self._sm_config['rabbitmq'], qdesc=annot_qdesc, logger=self.logger
        )
        self._update_queue_pub = QueuePublisher(
            config=self._sm_config['rabbitmq'], qdesc=upd_qdesc, logger=self.logger
        )

    def _on_success(self, msg):
        self.logger.info(' SM lithops daemon: success')
        self._manager.post_to_slack('dart', f' [v] Annotation succeeded: {json.dumps(msg)}')

    # pylint: disable=unused-argument
    def _on_failure(self, msg, e):

        # Stop processing in case of problem with imzML file
        if isinstance(e, ImzMLError):
            if 'email' in msg:
                self._manager.send_failed_email(msg, e.traceback)

            os.kill(os.getpid(), signal.SIGINT)
            self._manager.ds_failure_handler(msg, e)
            return

        exc = format_exc(limit=10)
        # Requeue the message so it retries
        if msg.get('retry_attempt', 0) < 1:
            self.logger.warning(f'Lithops annotation failed, retrying.\n{exc}')
            self._lithops_queue_pub.publish(
                {**msg, 'retry_attempt': msg.get('retry_attempt', 0) + 1}
            )
            self._manager.post_to_slack(
                'bomb',
                f" [x] Annotation failed, retrying: {json.dumps(msg)}\n```{exc}```",
            )
        else:
            self.logger.critical(f'Lithops annotation failed. Falling back to Spark\n{exc}')
            self._annot_queue_pub.publish(msg)

            self._manager.post_to_slack(
                'bomb',
                f" [x] Annotation failed, retrying on Spark: {json.dumps(msg)}\n```{exc}```",
            )

        # Exit the process and let supervisor restart it, in case Lithops was left in
        # an unrecoverable state
        os.kill(os.getpid(), signal.SIGINT)

    def _callback(self, msg):
        try:
            self.logger.info(f' SM lithops daemon received a message: {msg}')
            self._manager.post_to_slack('new', f' [v] New annotation message: {json.dumps(msg)}')

            ds = self._manager.load_ds(msg['ds_id'])
            self._manager.set_ds_status(ds, DatasetStatus.ANNOTATING)
            self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.STARTED)

            self._manager.annotate_lithops(
                ds=ds,
                del_first=msg.get('del_first', False),
                perform_enrichment=msg.get('perform_enrichment', False),
            )

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
        except ImzMLError:
            raise
        except LithopsStalledException:
            raise
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

    def join(self):
        if not self._stopped:
            self._lithops_queue_cons.join()
