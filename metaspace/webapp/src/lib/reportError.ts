import { ElNotification } from 'element-ui/types/notification';
import * as Raven from 'raven-js';

let $notify: ElNotification;

export function setErrorNotifier(_$notify: ElNotification) {
  $notify = _$notify;
}

export default function reportError(err: Error, message?: string) {
  try {
    Raven.captureException(err);
    if ($notify != null) {
      $notify.error(message || 'Oops! Something went wrong. Please refresh the page and try again.');
    }
  } catch (ex) {
    console.error(ex);
    /* Avoid breaking down-stream error handling  */
  }
}
