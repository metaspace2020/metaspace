import { ElNotification } from 'element-ui/types/notification'
import * as Sentry from '@sentry/browser'
import { every } from 'lodash-es'

let $notify: ElNotification

export function setErrorNotifier(_$notify: ElNotification) {
  $notify = _$notify
}

function isHandled(err: any) {
  try {
    return err && err.graphQLErrors && every(err.graphQLErrors, e => e && e.isHandled)
  } catch {
    return false
  }
}

const DEFAULT_MESSAGE = 'Oops! Something went wrong. Please refresh the page and try again.'

export default function reportError(err: Error, message: string | null = DEFAULT_MESSAGE) {
  try {
    if (!isHandled(err)) {
      Sentry.captureException(err)
      console.error(err)
      if ($notify != null && message) {
        $notify.error(message)
      }
    }
  } catch (ex) {
    console.error(ex)
    /* Avoid breaking down-stream error handling  */
  }
}
