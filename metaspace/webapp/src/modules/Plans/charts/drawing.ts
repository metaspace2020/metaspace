// Framework-free SVG drawing helpers for the METASPACE Pro landing page charts.
// Kept free of Vue imports so they can be unit tested directly.

const NS = 'http://www.w3.org/2000/svg'

// The reference design uses IBM Plex Mono. We deliberately avoid a webfont
// request and fall back to the platform monospace stack.
export const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export const VIRIDIS = ['#440154', '#46327E', '#365C8D', '#277F8E', '#1FA187', '#4AC16D', '#9FDA3A', '#FDE725']

export const viridis = (t: number): string => VIRIDIS[Math.round(Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1))]

// Linear congruential generator. Seeded so every render of a chart is
// identical - the charts are decorative, and a stable result avoids layout
// shifting between renders and keeps snapshots meaningful.
export const seededRng = (seed: number): (() => number) => {
  let s = ((seed % 4294967296) + 4294967296) % 4294967296
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export const svgEl = (name: string, attrs: Record<string, string | number> = {}): SVGElement => {
  const el = document.createElementNS(NS, name) as SVGElement
  Object.keys(attrs).forEach((key) => el.setAttribute(key, String(attrs[key])))
  return el
}

export const svgText = (
  x: number,
  y: number,
  text: string,
  attrs: Record<string, string | number> = {}
): SVGTextElement => {
  const el = svgEl('text', {
    x,
    y,
    fill: '#7C8892',
    'font-family': MONO_STACK,
    'font-size': 9,
    ...attrs,
  }) as SVGTextElement
  el.textContent = text
  return el
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** True when the document is in a background/hidden tab at the moment we draw. */
export const isDocumentHidden = (): boolean => typeof document !== 'undefined' && document.hidden === true

/**
 * Whether the figure must be rendered complete and static rather than animated.
 *
 * Reduced motion is the obvious case. The hidden-tab case is the important one:
 * a background tab throttles `requestAnimationFrame` to nothing, so an entrance
 * that hangs its "reveal" off a frame callback - or off an IntersectionObserver,
 * which also never reports an intersection for a document that is not being
 * painted - would leave every node parked at `opacity: 0`. Switching to the tab
 * later shows a blank figure. Detect it up front and skip the animation
 * entirely: a static, fully painted chart is always the safe fallback.
 */
export const shouldRenderStatic = (): boolean => prefersReducedMotion() || isDocumentHidden()

// How long an entrance may wait for its normal trigger (a frame callback, or
// the visibility gate) before it is force-completed. Comfortably longer than
// the slowest stagger the figures schedule, so it only ever fires when the
// normal trigger genuinely never arrived.
export const ENTRANCE_FALLBACK_MS = 2000

// Every pending entrance registers its own "just finish now" callback here so a
// single timer and a single `visibilitychange` listener can force-complete all
// of them at once, rather than one timer and one listener per node (the ion
// image alone schedules a couple of hundred).
const pendingEntrances = new Set<() => void>()
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let onVisibilityChange: (() => void) | null = null

const disarmEntranceFallback = (): void => {
  if (fallbackTimer !== null) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
  if (onVisibilityChange !== null) {
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    onVisibilityChange = null
  }
}

/** Force-completes every entrance still waiting for its trigger. */
export const flushEntrances = (): void => {
  const waiting = Array.from(pendingEntrances)
  pendingEntrances.clear()
  disarmEntranceFallback()
  waiting.forEach((complete) => complete())
}

const armEntranceFallback = (): void => {
  if (fallbackTimer === null && typeof setTimeout === 'function') {
    fallbackTimer = setTimeout(flushEntrances, ENTRANCE_FALLBACK_MS)
  }
  if (
    onVisibilityChange === null &&
    typeof document !== 'undefined' &&
    typeof document.addEventListener === 'function'
  ) {
    // Removes itself as soon as it has done its job - see the disarm in
    // `flushEntrances` and in the per-entrance `finish` below.
    onVisibilityChange = () => {
      if (!isDocumentHidden()) {
        flushEntrances()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
}

/**
 * Registers an entrance and hands back the idempotent function that completes
 * it. Call the returned function from the normal trigger; if that trigger never
 * arrives, the shared timeout or a `visibilitychange` will call it instead. An
 * entrance therefore can never strand its node at `opacity: 0`.
 */
export const registerEntrance = (complete: () => void): (() => void) => {
  let done = false
  const finish = (): void => {
    if (done) {
      return
    }
    done = true
    pendingEntrances.delete(finish)
    if (pendingEntrances.size === 0) {
      disarmEntranceFallback()
    }
    complete()
  }
  pendingEntrances.add(finish)
  armEntranceFallback()
  return finish
}

// Fades a node in after `delay` seconds. With reduced motion - or in a hidden
// tab, where no frame callback would ever run - the node is left at its final
// state so the chart is still fully legible.
export const fadeIn = <T extends SVGElement>(node: T, delay: number, dur = 0.45): T => {
  if (shouldRenderStatic()) {
    return node
  }
  node.style.opacity = '0'
  node.style.transition = `opacity ${dur}s ease ${delay}s`
  const reveal = registerEntrance(() => {
    node.style.opacity = '1'
  })
  requestAnimationFrame(() => requestAnimationFrame(reveal))
  return node
}

// Padding added to a measured path length so sub-pixel rounding in the
// geometry cannot leave a hairline of the tail undrawn.
const DRAW_IN_PAD = 4

// Used only when the browser cannot measure the path - jsdom implements no
// SVG geometry, so `getTotalLength` is simply absent there. This is
// deliberately far longer than any trace we draw (the m/z spectrum stick path,
// the longest by a wide margin, sums to ~1240 user units).
//
// The asymmetry matters. With `stroke-dasharray: L` on a path whose true
// length is longer than L, the segment beyond L is painted by the *second*
// dash and is therefore visible from the very first frame; animating the
// offset to 0 reveals the head while simultaneously hiding that tail, which
// reads as "the stroke draws to the middle and stops". Overshooting instead
// keeps the path a single uninterrupted gap at rest and merely finishes the
// reveal a little early - invisible to the eye. So always err long.
export const DRAW_IN_FALLBACK_LENGTH = 12000

/**
 * Measures a path's length for a dash-based reveal, padded so the tail fully
 * clears. Falls back to a deliberately over-long constant when the geometry
 * API is unavailable (jsdom) or returns a nonsensical value.
 *
 * The node must already be attached to the document - measuring a path that
 * has not been laid out can return 0.
 */
export const measurePathLength = (path: SVGPathElement, fallback = DRAW_IN_FALLBACK_LENGTH): number => {
  if (typeof path.getTotalLength !== 'function') {
    return fallback
  }
  try {
    const len = path.getTotalLength()
    return Number.isFinite(len) && len > 0 ? len + DRAW_IN_PAD : fallback
  } catch (e) {
    return fallback
  }
}

/**
 * Runs `run` once `el` has actually been on screen, so a reveal is never spent
 * on a figure the reader cannot see. Falls back to running immediately where
 * IntersectionObserver is unavailable.
 *
 * Returns a disposer for the observer; it is also disconnected automatically
 * the first time the element intersects.
 */
export const whenVisible = (el: Element, run: () => void): (() => void) => {
  const noop = () => undefined
  if (typeof IntersectionObserver !== 'function') {
    run()
    return noop
  }
  let fired = false
  const observer = new IntersectionObserver((entries) => {
    if (fired || !entries.some((entry) => entry.isIntersecting)) {
      return
    }
    fired = true
    observer.disconnect()
    run()
  })
  observer.observe(el)
  return () => observer.disconnect()
}

// Reading a computed value forces the browser to resolve the style it has
// pending, which is what makes the hidden state below the *previous* value of
// the reveal rather than something the reveal has to be inferred from.
const flushStyle = (el: Element): void => {
  if (typeof getComputedStyle === 'function') {
    void getComputedStyle(el).strokeDashoffset
  }
}

const nextFrame = (fn: () => void): void => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => fn())
  } else {
    fn()
  }
}

/**
 * Reveals a stroked path by animating `stroke-dashoffset` from its full
 * measured length down to 0. With reduced motion the path is left untouched,
 * i.e. fully drawn and static.
 *
 * Call this only after `path` has been appended to a laid-out document - the
 * length measurement needs it - which is exactly why the hidden state has to
 * be seeded with `transition: none`. On an *attached* node, going from the
 * initial offset of 0 up to the full length is itself an animatable change:
 * with the reveal transition already declared, the browser happily animates
 * the path *into* hiding over the full duration. Flipping the offset back to 0
 * a frame later then merely reverses however little of that had elapsed - and
 * Chrome shortens a reversal in proportion - so the reveal ran from ~11% of
 * the length over ~11% of the duration and read as "only the tail of the
 * trace, far too fast". Seeding with transitions off makes hiding instant, so
 * the reveal started below is the only transition that ever runs.
 */
export const drawIn = <T extends SVGPathElement>(path: T, transition: string): T => {
  if (shouldRenderStatic()) {
    return path
  }
  const len = measurePathLength(path)
  path.style.transition = 'none'
  path.setAttribute('stroke-dasharray', String(len))
  path.setAttribute('stroke-dashoffset', String(len))

  // Registered as an entrance so that a visibility gate which never reports -
  // the failure mode in a background tab - cannot leave the stroke permanently
  // hidden behind a full dash offset.
  const reveal = registerEntrance(() => {
    path.style.transition = transition
    flushStyle(path)
    path.setAttribute('stroke-dashoffset', '0')
  })
  whenVisible(path.ownerSVGElement || path, () => nextFrame(reveal))
  return path
}

export const clear = (el: SVGElement): void => {
  while (el.firstChild) {
    el.removeChild(el.firstChild)
  }
}
