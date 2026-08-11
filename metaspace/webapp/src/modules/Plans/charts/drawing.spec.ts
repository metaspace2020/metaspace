import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  seededRng,
  viridis,
  VIRIDIS,
  svgEl,
  svgText,
  MONO_STACK,
  clear,
  prefersReducedMotion,
  isDocumentHidden,
  shouldRenderStatic,
  fadeIn,
  drawIn,
  measurePathLength,
  whenVisible,
  registerEntrance,
  flushEntrances,
  ENTRANCE_FALLBACK_MS,
  DRAW_IN_FALLBACK_LENGTH,
} from './drawing'

// The longest path the Pro charts draw is the m/z spectrum stick path, ~1240
// user units. Any fallback dash length must comfortably exceed it - see the
// note on DRAW_IN_FALLBACK_LENGTH for why erring short produces a visible bug.
const LONGEST_PLAUSIBLE_PATH = 4440

const stubHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

const restoreHidden = () => {
  delete (document as any).hidden
}

afterEach(() => {
  restoreHidden()
  flushEntrances()
})

const makePath = (totalLength?: number): SVGPathElement => {
  const path = svgEl('path', { d: 'M 0 0 L 10 0' }) as SVGPathElement
  if (totalLength !== undefined) {
    // jsdom implements no SVG geometry, so getTotalLength is absent unless we
    // put it there ourselves.
    ;(path as any).getTotalLength = () => totalLength
  }
  return path
}

const frames = (count: number): Promise<void> =>
  new Promise((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)))
    step(count)
  })

/**
 * jsdom ships no IntersectionObserver and the shared test setup installs one
 * that never reports anything, so the visibility gate has to be driven by
 * hand: this stub captures the callbacks and lets a test say "now it is on
 * screen".
 */
const stubIntersectionObserver = () => {
  const original = (globalThis as any).IntersectionObserver
  const callbacks: IntersectionObserverCallback[] = []
  let disconnects = 0
  ;(globalThis as any).IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      callbacks.push(callback)
    }

    observe() {}
    unobserve() {}
    disconnect() {
      disconnects += 1
    }
  }
  const report = (isIntersecting: boolean) =>
    callbacks.forEach((cb) => cb([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver))
  return {
    report,
    intersect: () => report(true),
    disconnects: () => disconnects,
    restore: () => {
      ;(globalThis as any).IntersectionObserver = original
    },
  }
}

describe('seededRng', () => {
  it('is deterministic for a given seed', () => {
    const a = seededRng(20261103)
    const b = seededRng(20261103)
    const seqA = [a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('produces values in [0, 1)', () => {
    const r = seededRng(77)
    for (let i = 0; i < 200; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('produces different sequences for different seeds', () => {
    expect(seededRng(1)()).not.toEqual(seededRng(2)())
  })

  it('produces exact LCG outputs for seededRng(1)', () => {
    // Hand-calculated values from LCG formula: s = (s * 1664525 + 1013904223) % 4294967296
    // Seed 1 normalizes to 1, then generates these values
    const r = seededRng(1)
    const v1 = r()
    const v2 = r()
    const v3 = r()
    // First three outputs must match the exact LCG sequence
    expect(v1).toBeCloseTo(1015568748 / 4294967296, 10)
    expect(v2).toBeCloseTo(1586005467 / 4294967296, 10)
    expect(v3).toBeCloseTo(2165703038 / 4294967296, 10)
  })

  it('handles large seeds without numeric precision loss', () => {
    // Large seed that would exceed MAX_SAFE_INTEGER without normalization
    const r = seededRng(1770000000000)
    for (let i = 0; i < 10; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('viridis', () => {
  it('maps 0 to the first stop and 1 to the last', () => {
    expect(viridis(0)).toBe(VIRIDIS[0])
    expect(viridis(1)).toBe(VIRIDIS[VIRIDIS.length - 1])
  })

  it('clamps out-of-range input', () => {
    expect(viridis(-5)).toBe(VIRIDIS[0])
    expect(viridis(5)).toBe(VIRIDIS[VIRIDIS.length - 1])
  })

  it('maps the midpoint into the middle of the ramp', () => {
    expect(viridis(0.5)).toBe(VIRIDIS[4])
  })
})

describe('svgEl', () => {
  it('creates a namespaced element with attributes applied', () => {
    const rect = svgEl('rect', { x: 10, y: 20, fill: '#fff' })
    expect(rect.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(rect.getAttribute('x')).toBe('10')
    expect(rect.getAttribute('fill')).toBe('#fff')
  })
})

describe('svgText', () => {
  it('sets the text content and uses the mono stack by default', () => {
    const t = svgText(5, 6, 'm/z 760')
    expect(t.textContent).toBe('m/z 760')
    expect(t.getAttribute('font-family')).toBe(MONO_STACK)
    expect(t.getAttribute('x')).toBe('5')
  })

  it('allows caller attrs to override defaults', () => {
    const t = svgText(0, 0, 'x', { fill: '#000', 'font-size': 20 })
    expect(t.getAttribute('fill')).toBe('#000')
    expect(t.getAttribute('font-size')).toBe('20')
  })
})

describe('clear', () => {
  it('removes all children from an element', () => {
    const parent = svgEl('g')
    parent.appendChild(svgEl('rect'))
    parent.appendChild(svgEl('circle'))
    parent.appendChild(svgEl('path'))
    expect(parent.children.length).toBe(3)
    clear(parent)
    expect(parent.children.length).toBe(0)
  })

  it('is a no-op on an empty element', () => {
    const parent = svgEl('g')
    expect(parent.children.length).toBe(0)
    clear(parent)
    expect(parent.children.length).toBe(0)
  })
})

describe('prefersReducedMotion', () => {
  it('returns true when matchMedia reports matches', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList)
    expect(prefersReducedMotion()).toBe(true)
    window.matchMedia = originalMatchMedia
  })

  it('returns false when matchMedia reports no matches', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    expect(prefersReducedMotion()).toBe(false)
    window.matchMedia = originalMatchMedia
  })

  it('returns false when window.matchMedia is undefined', () => {
    const originalMatchMedia = window.matchMedia
    // @ts-expect-error - Testing undefined matchMedia
    window.matchMedia = undefined
    expect(prefersReducedMotion()).toBe(false)
    window.matchMedia = originalMatchMedia
  })
})

describe('isDocumentHidden / shouldRenderStatic', () => {
  it('reports the document visibility state', () => {
    stubHidden(true)
    expect(isDocumentHidden()).toBe(true)
    stubHidden(false)
    expect(isDocumentHidden()).toBe(false)
  })

  it('forces a static render in a hidden tab even without reduced motion', () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    try {
      stubHidden(true)
      expect(shouldRenderStatic()).toBe(true)
      stubHidden(false)
      expect(shouldRenderStatic()).toBe(false)
    } finally {
      window.matchMedia = original
    }
  })

  it('forces a static render under reduced motion even in a visible tab', () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList)
    try {
      stubHidden(false)
      expect(shouldRenderStatic()).toBe(true)
    } finally {
      window.matchMedia = original
    }
  })
})

describe('registerEntrance', () => {
  it('completes once, whichever trigger arrives first', () => {
    const complete = vi.fn()
    const finish = registerEntrance(complete)
    finish()
    finish()
    flushEntrances()
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('force-completes a pending entrance when the normal trigger never arrives', () => {
    vi.useFakeTimers()
    try {
      const complete = vi.fn()
      registerEntrance(complete)
      expect(complete).not.toHaveBeenCalled()
      vi.advanceTimersByTime(ENTRANCE_FALLBACK_MS + 1)
      // Without this, an entrance whose rAF or observer never fires leaves its
      // node at opacity 0 for good - the blank-figure bug.
      expect(complete).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('completes pending entrances when the tab becomes visible', () => {
    stubHidden(true)
    const complete = vi.fn()
    registerEntrance(complete)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(complete).not.toHaveBeenCalled()

    stubHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('removes the visibilitychange listener once every entrance has fired', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    try {
      const finish = registerEntrance(vi.fn())
      const listener = add.mock.calls.find(([type]) => type === 'visibilitychange')?.[1]
      expect(listener).toBeTruthy()
      finish()
      expect(remove).toHaveBeenCalledWith('visibilitychange', listener)

      // And it does not fire again after removal.
      const complete = vi.fn()
      registerEntrance(complete)
      const second = add.mock.calls.filter(([type]) => type === 'visibilitychange')
      expect(second).toHaveLength(2)
    } finally {
      add.mockRestore()
      remove.mockRestore()
      flushEntrances()
    }
  })

  it('shares one timer and one listener across many entrances', () => {
    const add = vi.spyOn(document, 'addEventListener')
    try {
      const finishes = Array.from({ length: 50 }, () => registerEntrance(vi.fn()))
      // 200-odd nodes fade in per figure; one listener for all of them.
      expect(add.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1)
      finishes.forEach((f) => f())
    } finally {
      add.mockRestore()
    }
  })
})

describe('measurePathLength', () => {
  it('uses the real measured length, not a constant', () => {
    expect(measurePathLength(makePath(4437.6))).toBeGreaterThanOrEqual(4437.6)
    expect(measurePathLength(makePath(1234))).toBeGreaterThanOrEqual(1234)
  })

  it('pads the measurement so the tail fully clears', () => {
    const measured = 4437.6
    const len = measurePathLength(makePath(measured))
    expect(len).toBeGreaterThan(measured)
    expect(len).toBeLessThan(measured + 20)
  })

  it('falls back to a length larger than any plausible path when getTotalLength is absent', () => {
    const path = makePath()
    expect(typeof path.getTotalLength).not.toBe('function')
    const len = measurePathLength(path)
    expect(len).toBe(DRAW_IN_FALLBACK_LENGTH)
    // The regression this guards: a small constant (the old code used 2400)
    // is roughly half the spectrum trace's true length, which leaves the far
    // half painted at rest and hides it as the reveal runs.
    expect(len).toBeGreaterThan(LONGEST_PLAUSIBLE_PATH)
  })

  it('falls back rather than trusting a zero or non-finite measurement', () => {
    // An unattached / unlaid-out path can measure as 0.
    expect(measurePathLength(makePath(0))).toBe(DRAW_IN_FALLBACK_LENGTH)
    expect(measurePathLength(makePath(NaN))).toBe(DRAW_IN_FALLBACK_LENGTH)
  })

  it('falls back when getTotalLength throws', () => {
    const path = makePath()
    ;(path as any).getTotalLength = () => {
      throw new Error('no geometry')
    }
    expect(measurePathLength(path)).toBe(DRAW_IN_FALLBACK_LENGTH)
  })

  it('honours an explicit fallback', () => {
    expect(measurePathLength(makePath(), 999)).toBe(999)
  })
})

describe('drawIn', () => {
  const withReducedMotion = (matches: boolean, fn: () => void) => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches }) as MediaQueryList)
    try {
      fn()
    } finally {
      window.matchMedia = original
    }
  }

  it('seeds dasharray and dashoffset from the measured length', () => {
    withReducedMotion(false, () => {
      const path = makePath(4437.6)
      drawIn(path, 'stroke-dashoffset 1.4s ease')

      const dasharray = Number(path.getAttribute('stroke-dasharray'))
      const dashoffset = Number(path.getAttribute('stroke-dashoffset'))
      // Both derive from the measurement - not from a constant, and not from
      // the fallback, since getTotalLength was available.
      expect(dasharray).toBeGreaterThanOrEqual(4437.6)
      expect(dasharray).toBeLessThan(DRAW_IN_FALLBACK_LENGTH)
      expect(dashoffset).toBe(dasharray)
    })
  })

  it('seeds the hidden state with transitions off, so hiding is never itself animated', () => {
    withReducedMotion(false, () => {
      const path = makePath(4437.6)
      drawIn(path, 'stroke-dashoffset 1.4s ease')

      // The regression this guards: `drawIn` is called on a path that is
      // already attached (it has to be, to be measurable), so raising the
      // offset from 0 to the full length is an animatable change. With the
      // reveal transition already in place the browser animates the path into
      // hiding, and the later flip back to 0 only reverses the sliver that had
      // elapsed - the reveal then shows just the tail of the trace, in a
      // fraction of the duration.
      expect(path.style.transition).toBe('none')
    })
  })

  it('tracks a different measured length rather than emitting a fixed number', () => {
    withReducedMotion(false, () => {
      const short = makePath(500)
      const long = makePath(9000)
      drawIn(short, 'x')
      drawIn(long, 'x')
      expect(Number(long.getAttribute('stroke-dasharray'))).toBeGreaterThan(
        Number(short.getAttribute('stroke-dasharray'))
      )
    })
  })

  it('never leaves the dasharray shorter than the path, even without geometry', () => {
    withReducedMotion(false, () => {
      const path = makePath()
      drawIn(path, 'x')
      expect(Number(path.getAttribute('stroke-dasharray'))).toBeGreaterThan(LONGEST_PLAUSIBLE_PATH)
    })
  })

  it('leaves the path fully drawn and static when reduced motion is ON', () => {
    withReducedMotion(true, () => {
      const path = makePath(4437.6)
      drawIn(path, 'stroke-dashoffset 1.4s ease')
      expect(path.getAttribute('stroke-dasharray')).toBeNull()
      expect(path.getAttribute('stroke-dashoffset')).toBeNull()
      expect(path.style.transition).toBe('')
    })
  })

  it('holds the path hidden until the visibility gate resolves, then reveals it', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    const gate = stubIntersectionObserver()
    try {
      const path = makePath(4437.6)
      drawIn(path, 'stroke-dashoffset 1.4s ease')

      // Frames alone must not start the reveal: while the figure is off
      // screen the whole draw would be spent unseen, and the reader would
      // catch only whatever is left of it once they scroll to it.
      await frames(3)
      expect(Number(path.getAttribute('stroke-dashoffset'))).toBeGreaterThan(0)
      expect(path.style.transition).toBe('none')

      gate.intersect()
      await frames(2)
      expect(path.getAttribute('stroke-dashoffset')).toBe('0')
      // The reveal transition is only declared at the moment the draw starts.
      expect(path.style.transition).toBe('stroke-dashoffset 1.4s ease')
      // The measured length stays on the dasharray - only the offset moves.
      expect(Number(path.getAttribute('stroke-dasharray'))).toBeGreaterThanOrEqual(4437.6)
    } finally {
      gate.restore()
      window.matchMedia = original
    }
  })

  it('ignores non-intersecting observer callbacks', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    const gate = stubIntersectionObserver()
    try {
      const path = makePath(4437.6)
      drawIn(path, 'x')
      gate.report(false)
      await frames(2)
      expect(Number(path.getAttribute('stroke-dashoffset'))).toBeGreaterThan(0)
    } finally {
      gate.restore()
      window.matchMedia = original
    }
  })

  it('draws without a gate when IntersectionObserver is unavailable', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    const originalObserver = (globalThis as any).IntersectionObserver
    ;(globalThis as any).IntersectionObserver = undefined
    try {
      const path = makePath(4437.6)
      drawIn(path, 'x')
      expect(Number(path.getAttribute('stroke-dashoffset'))).toBeGreaterThan(0)
      await frames(2)
      expect(path.getAttribute('stroke-dashoffset')).toBe('0')
    } finally {
      ;(globalThis as any).IntersectionObserver = originalObserver
      window.matchMedia = original
    }
  })

  it('leaves the path fully drawn and static in a hidden tab', () => {
    withReducedMotion(false, () => {
      stubHidden(true)
      const path = makePath(4437.6)
      drawIn(path, 'stroke-dashoffset 1.4s ease')
      // Otherwise the stroke sits behind a full dash offset waiting for an
      // IntersectionObserver that a background tab never fires.
      expect(path.getAttribute('stroke-dasharray')).toBeNull()
      expect(path.getAttribute('stroke-dashoffset')).toBeNull()
      restoreHidden()
    })
  })

  it('force-completes the reveal when the visibility gate never reports', () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    const gate = stubIntersectionObserver()
    vi.useFakeTimers()
    try {
      const path = makePath(4437.6)
      drawIn(path, 'stroke-dashoffset 1.4s ease')
      expect(Number(path.getAttribute('stroke-dashoffset'))).toBeGreaterThan(0)

      vi.advanceTimersByTime(ENTRANCE_FALLBACK_MS + 1)
      expect(path.getAttribute('stroke-dashoffset')).toBe('0')
      expect(path.style.transition).toBe('stroke-dashoffset 1.4s ease')
    } finally {
      vi.useRealTimers()
      gate.restore()
      window.matchMedia = original
    }
  })

  it('reveals on visibilitychange when the gate never reports', () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    const gate = stubIntersectionObserver()
    try {
      stubHidden(false)
      const path = makePath(4437.6)
      drawIn(path, 'x')
      expect(Number(path.getAttribute('stroke-dashoffset'))).toBeGreaterThan(0)
      document.dispatchEvent(new Event('visibilitychange'))
      expect(path.getAttribute('stroke-dashoffset')).toBe('0')
    } finally {
      restoreHidden()
      gate.restore()
      window.matchMedia = original
    }
  })

  it('stops observing once the draw has started', () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    const gate = stubIntersectionObserver()
    try {
      drawIn(makePath(4437.6), 'x')
      expect(gate.disconnects()).toBe(0)
      gate.intersect()
      expect(gate.disconnects()).toBe(1)
    } finally {
      gate.restore()
      window.matchMedia = original
    }
  })
})

describe('whenVisible', () => {
  it('runs the callback the first time the element intersects, once only', () => {
    const gate = stubIntersectionObserver()
    try {
      const run = vi.fn()
      whenVisible(svgEl('g'), run)
      expect(run).not.toHaveBeenCalled()
      gate.intersect()
      gate.intersect()
      expect(run).toHaveBeenCalledTimes(1)
    } finally {
      gate.restore()
    }
  })

  it('runs the callback immediately without IntersectionObserver support', () => {
    const originalObserver = (globalThis as any).IntersectionObserver
    ;(globalThis as any).IntersectionObserver = undefined
    try {
      const run = vi.fn()
      whenVisible(svgEl('g'), run)
      expect(run).toHaveBeenCalledTimes(1)
    } finally {
      ;(globalThis as any).IntersectionObserver = originalObserver
    }
  })
})

describe('fadeIn', () => {
  it('sets opacity to 0 and transition when reduced motion is OFF', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)

    const rect = svgEl('rect') as SVGRectElement
    fadeIn(rect, 0.1, 0.5)

    expect(rect.style.opacity).toBe('0')
    expect(rect.style.transition).toContain('0.5s')
    expect(rect.style.transition).toContain('0.1s')

    window.matchMedia = originalMatchMedia
  })

  it('leaves node unchanged when reduced motion is ON', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList)

    const rect = svgEl('rect') as SVGRectElement
    fadeIn(rect, 0.1, 0.5)

    expect(rect.style.opacity).toBe('')
    expect(rect.style.transition).toBe('')

    window.matchMedia = originalMatchMedia
  })

  it('leaves node unchanged in a hidden tab, where no frame callback would run', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    stubHidden(true)

    const rect = svgEl('rect') as SVGRectElement
    fadeIn(rect, 0.1, 0.5)

    // A background tab throttles rAF to nothing, so seeding opacity 0 here
    // would leave the node invisible until the reader switched tabs.
    expect(rect.style.opacity).toBe('')
    expect(rect.style.transition).toBe('')

    restoreHidden()
    window.matchMedia = originalMatchMedia
  })

  it('force-completes the fade if the frame callback never arrives', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    const originalRaf = globalThis.requestAnimationFrame
    // Stand in for a throttled tab: rAF is called but never invokes back.
    globalThis.requestAnimationFrame = vi.fn(() => 0) as any
    vi.useFakeTimers()
    try {
      const rect = svgEl('rect') as SVGRectElement
      fadeIn(rect, 0.1, 0.5)
      expect(rect.style.opacity).toBe('0')
      vi.advanceTimersByTime(ENTRANCE_FALLBACK_MS + 1)
      expect(rect.style.opacity).toBe('1')
    } finally {
      vi.useRealTimers()
      globalThis.requestAnimationFrame = originalRaf
      window.matchMedia = originalMatchMedia
    }
  })

  it('calls requestAnimationFrame without throwing', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)

    const rect = svgEl('rect') as SVGRectElement
    // This should not throw even if rAF doesn't exist
    expect(() => {
      fadeIn(rect, 0.1, 0.5)
    }).not.toThrow()

    window.matchMedia = originalMatchMedia
  })
})
