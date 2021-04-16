import json
import logging
from traceback import format_exc

from sm.engine.daemons.actions import DaemonAction, DaemonActionStage
from sm.engine.daemons.dataset_manager import DatasetManager
from sm.engine.dataset import DatasetStatus
from sm.engine.errors import UnknownDSID, SMError, IndexUpdateError


class SMUpdateDaemon:
    """Reads messages from the update queue and does indexing/update/delete"""

    logger = logging.getLogger('update-daemon')

    def __init__(self, manager: DatasetManager, make_update_queue_cons):
        self._manager = manager
        self._update_queue_cons = make_update_queue_cons(
            callback=self._callback, on_success=self._on_success, on_failure=self._on_failure
        )
        self._stopped = False

    def _on_success(self, msg):
        self.logger.info(' SM update daemon: success')

        if msg['action'] == DaemonAction.DELETE:
            self._manager.notify_update(
                msg['ds_id'], action=DaemonAction.DELETE, stage=DaemonActionStage.FINISHED
            )
        else:
            ds = self._manager.load_ds(msg['ds_id'])
            if msg['action'] == DaemonAction.INDEX:
                self._manager.set_ds_status(ds, DatasetStatus.FINISHED)
            self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.FINISHED)

        if msg['action'] in [DaemonAction.UPDATE, DaemonAction.INDEX]:
            msg['web_app_link'] = self._manager.create_web_app_link(msg)

        if msg['action'] == DaemonAction.DELETE:
            self._manager.post_to_slack(
                'dart', f' [v] Succeeded to {msg["action"]}: {json.dumps(msg)}'
            )

        if msg.get('email'):
            self._manager.send_success_email(msg)

    def _on_failure(self, msg, e):
        self._manager.ds_failure_handler(msg, e)

        if 'email' in msg:
            self._manager.send_failed_email(msg)

    def _callback(self, msg):
        try:
            self.logger.info(f' SM update daemon received a message: {msg}')

            ds = self._manager.load_ds(msg['ds_id'])
            self._manager.notify_update(ds.id, msg['action'], DaemonActionStage.STARTED)

            if msg['action'] == DaemonAction.INDEX:
                self._manager.index(ds=ds)

            elif msg['action'] == DaemonAction.CLASSIFY_OFF_SAMPLE:
                try:
                    # depending on number of annotations may take up to several minutes
                    self._manager.classify_dataset_images(ds)
                except Exception as e:  # don't fail dataset when off-sample pred fails
                    self.logger.warning(f'Failed to classify off-sample: {e}')

                try:
                    self._manager.index(ds=ds)
                except UnknownDSID:
                    # Sometimes the DS will have been deleted before this point
                    self.logger.warning(f'DS missing after off-sample classification: {ds.id}')

            elif msg['action'] == DaemonAction.UPDATE:
                self._manager.update(ds, msg['fields'])
            elif msg['action'] == DaemonAction.DELETE:
                self._manager.delete(ds=ds)
            else:
                raise SMError(f'Wrong action: {msg["action"]}')
        except Exception as e:
            raise IndexUpdateError(msg['ds_id'], traceback=format_exc(chain=False)) from e

    def start(self):
        self._stopped = False
        self._update_queue_cons.start()

    def stop(self):
        if not self._stopped:
            self._update_queue_cons.stop()
            self._update_queue_cons.join()
            self._stopped = True

    def join(self):
        if not self._stopped:
            self._update_queue_cons.join()
