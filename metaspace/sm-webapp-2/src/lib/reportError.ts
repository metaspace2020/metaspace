import * as Sentry from '@sentry/browser'
import { every } from 'lodash-es'
import { Primitive } from 'ts-essentials'
import { ElNotification } from 'element-plus/lib/components/notification'
import {getLocalStorage, setLocalStorage} from "../lib/localStorage";

let $notify: typeof ElNotification

export function setErrorNotifier(_$notify: typeof ElNotification) {
  $notify = _$notify
}

function isHandled(err: Error | any) {
  try {
    return !!((err?.graphQLErrors && every(err.graphQLErrors, e => e && e.isHandled)) || err?.isHandled)
  } catch {
    return false
  }
}

const DEFAULT_MESSAGE = 'Oops! Something went wrong. Please refresh the page and try again.'

export default function reportError(
  err: Error | any,
  message: string | null = DEFAULT_MESSAGE,
  extraData?: Record<string, Primitive>,
) {
  try {
    if (!isHandled(err)) {
      Sentry.captureException(err, { contexts: { 'Extra Data': extraData } })
      console.error(err, extraData)
      const isReportingError = getLocalStorage('reportError')

      setTimeout(() => {
        setLocalStorage('reportError', false)
      }, 500)

      if ($notify != null && message && !isReportingError) {
        setLocalStorage('reportError', true)
        $notify.error(message)
      }
    }
  } catch (ex) {
    console.error(ex)
    /* Avoid breaking down-stream error handling  */
  }
}
