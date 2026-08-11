import { prefersReducedMotion } from './charts/drawing'

// In-page "#hash" anchors (e.g. "Submit your private dataset" -> #plans)
// don't fire a popstate/hashchange when the URL already ends in that hash -
// which is exactly the state a visitor lands in after /plans redirects to
// /pro#plans and scrolls back up. Without this, clicking the anchor again
// does nothing. Scrolling manually here makes the click work regardless of
// the current hash, and scroll-margin-top on the target section (see
// ProPage.scss) keeps the same offset the router's scrollBehavior applies.
export const scrollToHashSection = (event: MouseEvent, hash: string): void => {
  const target = typeof document !== 'undefined' ? document.querySelector(hash) : null
  if (!target) {
    return
  }
  event.preventDefault()
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
}
