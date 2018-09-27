import { ElNotification } from 'element-ui/types/notification';
import * as Raven from 'raven-js';
import { every } from 'lodash-es';

let $notify: ElNotification;

export function setErrorNotifier(_$notify: ElNotification) {
  $notify = _$notify;
}

function isHandled(err: any) {
  try {
    if (err && err.graphQLErrors && every(err.graphQLErrors, e => e && e.isHandled)) {
      return true;
    }
  } catch {}
  return false;
}

export default function reportError(err: Error, message?: string) {
  try {
    if (!isHandled(err)) {
      Raven.captureException(err);
      console.error(err);
      if ($notify != null) {
        $notify.error(message || 'Oops! Something went wrong. Please refresh the page and try again.');
      }
    }
  } catch (ex) {
    console.error(ex);
    /* Avoid breaking down-stream error handling  */
  }
}
