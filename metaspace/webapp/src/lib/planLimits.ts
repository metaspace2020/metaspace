import { ElNotification } from './element-plus'

/**
 * Detects the "usage limit reached" error returned by the graphql plan module
 * (assertCanPerformAction) so callers can show an upgrade prompt instead of a
 * generic failure message.
 */
export const isPlanLimitError = (err: any): boolean => {
  const message = err?.graphQLErrors?.[0]?.message || err?.message
  return !!message && /limit/i.test(message)
}

/**
 * Upgrade prompt shown when a free user exhausts their plan's usage limit.
 * Mirrors the upload page's message style: fixed text plus a link to the plans
 * page to engage the user. Sticky (duration 0) so the link stays clickable.
 */
export function notifyPlanLimitReached(activityDescription: string): void {
  ElNotification.warning({
    title: '',
    message:
      `You have reached the limit of ${activityDescription} on your plan. ` +
      'Please <a href="/plans">upgrade your plan</a>.',
    dangerouslyUseHTMLString: true,
    duration: 0,
  })
}
