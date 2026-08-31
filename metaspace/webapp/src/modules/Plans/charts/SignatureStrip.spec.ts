import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SignatureStrip from './SignatureStrip'
import { drawSignatureStrip } from './signatureStripDrawing'
import { DRAW_IN_FALLBACK_LENGTH } from './drawing'

const makeSvg = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement

const stubReducedMotion = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  // @ts-expect-error - cleanup test-only override
  delete window.matchMedia
})

describe('drawSignatureStrip', () => {
  it('draws the four panels into the svg', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    expect(svg.querySelectorAll('g').length).toBeGreaterThanOrEqual(6)
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(20)
    expect(svg.querySelectorAll('circle').length).toBeGreaterThan(20)
  })

  it('uses the taller portrait viewBox that fits the 2x2 grid', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    expect(svg.getAttribute('viewBox')).toBe('0 0 340 380')
  })

  it('lays the four header bands out on a 2x2 grid', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    const bands = Array.from(svg.querySelectorAll('rect'))
      .filter((rect) => rect.getAttribute('fill') === '#FEF4E7')
      .map((rect) => [rect.getAttribute('x'), rect.getAttribute('y')])
    // Two columns (x 14 / 182) by two rows (y 3 / 203), all 144 wide.
    expect(bands).toEqual([
      ['14', '3'],
      ['182', '3'],
      ['14', '203'],
      ['182', '203'],
    ])
    Array.from(svg.querySelectorAll('rect'))
      .filter((rect) => rect.getAttribute('fill') === '#FEF4E7')
      .forEach((rect) => {
        expect(rect.getAttribute('width')).toBe('144')
        expect(rect.getAttribute('height')).toBe('15')
      })
  })

  it('is idempotent - redrawing replaces rather than appends', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    const first = svg.childElementCount
    const firstTotal = svg.querySelectorAll('*').length
    drawSignatureStrip(svg)
    expect(svg.childElementCount).toBe(first)
    expect(svg.querySelectorAll('*').length).toBe(firstTotal)
  })

  it('renders the annotated m/z title and labels only the base peak on the axis', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    expect(svg.textContent).toContain('m/z 760.5851')
    expect(svg.textContent).toContain('760.5851')
    // The other five key ions keep their ticks and centroid dots but lose their
    // text, which was unreadable once the panel became a quadrant.
    ;['703.5745', '810.6011', '885.5498', '888.6241', '906.6347'].forEach((label) => {
      expect(svg.textContent).not.toContain(label)
    })
  })

  it('marks the spectrum as centroided rather than profile', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    expect(svg.textContent).toContain('(centroided)')
  })

  describe('centroided spectrum sticks', () => {
    const stickPath = (svg: SVGSVGElement) =>
      Array.from(svg.querySelectorAll('path')).find((p) => p.getAttribute('stroke') === '#101820')!

    // Panel groups are appended in order: headers, spectrum, image, volcano,
    // cross-dataset, flow. Scoping matters - the volcano's significant points
    // share the centroid dots' accent fill.
    const spectrumGroup = (svg: SVGSVGElement) => svg.children[1] as SVGGElement

    it('draws every peak as an independent vertical stick, never a connected trace', () => {
      const svg = makeSvg()
      drawSignatureStrip(svg)
      const d = stickPath(svg).getAttribute('d')!
      const commands = d.match(/[ML]/g) || []
      // Strictly alternating M/L pairs: a horizontal run joining two peaks
      // would show up as two consecutive Ls.
      expect(commands.length % 2).toBe(0)
      commands.forEach((cmd, i) => expect(cmd).toBe(i % 2 === 0 ? 'M' : 'L'))

      // Each pair shares one x, so every segment is exactly vertical.
      const pairs = d.split('M ').filter(Boolean)
      expect(pairs.length).toBeGreaterThan(20)
      pairs.forEach((pair) => {
        const [x1, , x2] = pair.trim().replace(' L ', ' ').split(' ')
        expect(x2).toBe(x1)
      })
    })

    it('caps every stick with an orange centroid dot, sized up on the key ions', () => {
      const svg = makeSvg()
      drawSignatureStrip(svg)
      const d = stickPath(svg).getAttribute('d')!
      const apexes = d
        .split('M ')
        .filter(Boolean)
        .map((pair) => pair.trim().replace(' L ', ' ').split(' '))
        .map(([x, , , y]) => `${x},${y}`)

      const dots = Array.from(spectrumGroup(svg).querySelectorAll('circle')).filter(
        (c) => c.getAttribute('fill') === '#F0961F'
      )
      const dotAt = new Map(dots.map((c) => [`${c.getAttribute('cx')},${c.getAttribute('cy')}`, c]))

      // One dot per stick tip - this is what makes the panel read as centroided.
      expect(dots.length).toBe(apexes.length)
      apexes.forEach((apex) => expect(dotAt.has(apex)).toBe(true))

      const radii = dots.map((c) => c.getAttribute('r'))
      expect(radii.filter((r) => r === '1.7')).toHaveLength(6)
      expect(radii.filter((r) => r === '1.15').length).toBeGreaterThan(15)
    })

    it('ticks the six key ions below the axis', () => {
      const svg = makeSvg()
      drawSignatureStrip(svg)
      const ticks = Array.from(svg.querySelectorAll('line')).filter(
        (l) => l.getAttribute('y1') === '152' && l.getAttribute('y2') === '161'
      )
      expect(ticks).toHaveLength(6)
    })
  })

  it('draws the cross-dataset heatmap with its three condition blocks', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    expect(svg.textContent).toContain('ctrl')
    expect(svg.textContent).toContain('treat')
    expect(svg.textContent).toContain('recov')
    expect(svg.textContent).toContain('40 datasets · 3 conditions')

    // 12 columns x 8 rows on a 10px pitch, starting at (26, 244).
    const cells = Array.from(svg.querySelectorAll('rect')).filter(
      (rect) => rect.getAttribute('width') === '8.8' && rect.getAttribute('height') === '8.8'
    )
    expect(cells).toHaveLength(96)
    const xs = new Set(cells.map((c) => c.getAttribute('x')))
    const ys = new Set(cells.map((c) => c.getAttribute('y')))
    expect(xs.size).toBe(12)
    expect(ys.size).toBe(8)

    // Two white rules separating the three blocks.
    const separators = Array.from(svg.querySelectorAll('line')).filter(
      (l) => l.getAttribute('stroke') === '#FFFFFF' && l.getAttribute('stroke-width') === '1.6'
    )
    expect(separators).toHaveLength(2)
  })

  it('carries the eye clockwise with three flow arrows', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    const shafts = Array.from(svg.querySelectorAll('line')).filter(
      (l) => l.getAttribute('stroke') === '#C6CFD6' && l.getAttribute('stroke-width') === '1'
    )
    // The six key-ion ticks share the arrow stroke, so match on geometry.
    const arrows = shafts.filter((l) => {
      const dx = Number(l.getAttribute('x2')) - Number(l.getAttribute('x1'))
      const dy = Number(l.getAttribute('y2')) - Number(l.getAttribute('y1'))
      return Math.abs(dx) === 14 || Math.abs(dy) === 14
    })
    expect(arrows).toHaveLength(3)

    const vectors = arrows.map((l) => [
      Number(l.getAttribute('x2')) - Number(l.getAttribute('x1')),
      Number(l.getAttribute('y2')) - Number(l.getAttribute('y1')),
    ])
    // spectrum -> annotation (rightwards), annotation -> volcano (downwards),
    // volcano -> cross-dataset (leftwards). The last one closes the loop.
    expect(vectors).toEqual([
      [14, 0],
      [0, 14],
      [-14, 0],
    ])
  })

  it('captions the figure as a whole', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    expect(svg.textContent).toContain('downstream analysis · in the browser')
  })

  it('produces identical output across draws with the same seed (deterministic)', () => {
    const a = makeSvg()
    const b = makeSvg()
    drawSignatureStrip(a)
    drawSignatureStrip(b)
    expect(a.innerHTML).toBe(b.innerHTML)
  })

  it('labels each of the four panels via its header bar', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    expect(svg.textContent).toContain('M/Z SPECTRUM')
    expect(svg.textContent).toContain('ANNOTATION')
    expect(svg.textContent).toContain('FDR ≤ 5%')
    expect(svg.textContent).toContain('CROSS-DATASET')
    expect(svg.textContent).toContain('ROI A VS B')
  })

  it('moves the ROI names out of the boxes and into a single shared legend', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    // "ROI A" appears twice: in the panel header ("ROI A VS B") and in the
    // legend. "ROI B" only in the legend. Never on the boxes themselves.
    const roiAOccurrences = svg.textContent?.match(/ROI A/g) || []
    const roiBOccurrences = svg.textContent?.match(/ROI B/g) || []
    expect(roiAOccurrences).toHaveLength(2)
    expect(roiBOccurrences).toHaveLength(1)
  })

  it('no longer draws the FDR-rejected connector annotation', () => {
    const svg = makeSvg()
    drawSignatureStrip(svg)
    expect(svg.textContent).not.toContain('below FDR cutoff')
  })

  describe('reduced motion', () => {
    it('does not animate the spectrum trace and leaves faded nodes visible when reduced motion is on', () => {
      stubReducedMotion(true)
      const svg = makeSvg()
      drawSignatureStrip(svg)

      const paths = Array.from(svg.querySelectorAll('path'))
      const trace = paths.find((p) => p.getAttribute('stroke') === '#101820')
      expect(trace).toBeTruthy()
      expect(trace!.getAttribute('stroke-dasharray')).toBeNull()
      expect(trace!.getAttribute('stroke-dashoffset')).toBeNull()

      // Every element that fadeIn touches must not be left invisible.
      const allNodes = Array.from(svg.querySelectorAll('*')) as SVGElement[]
      const hiddenNodes = allNodes.filter((n) => n.style.opacity === '0')
      expect(hiddenNodes.length).toBe(0)
    })

    it('does animate the spectrum trace when reduced motion is off', () => {
      stubReducedMotion(false)
      const svg = makeSvg()
      drawSignatureStrip(svg)

      const paths = Array.from(svg.querySelectorAll('path'))
      const trace = paths.find((p) => p.getAttribute('stroke') === '#101820')
      expect(trace).toBeTruthy()
      expect(trace!.getAttribute('stroke-dasharray')).not.toBeNull()
      expect(trace!.getAttribute('stroke-dashoffset')).not.toBeNull()
    })
  })

  describe('hidden tab', () => {
    const withHidden = (hidden: boolean, fn: () => void) => {
      const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
      try {
        fn()
      } finally {
        delete (document as any).hidden
        if (descriptor) {
          Object.defineProperty(Document.prototype, 'hidden', descriptor)
        }
      }
    }

    it('renders complete and static when the page loads in a background tab', () => {
      stubReducedMotion(false)
      withHidden(true, () => {
        const svg = makeSvg()
        drawSignatureStrip(svg)

        // The bug: rAF and IntersectionObserver are both starved in a hidden
        // tab, so anything gated on them stays at opacity 0 forever and the
        // figure is blank when the reader finally switches to it.
        const hidden = (Array.from(svg.querySelectorAll('*')) as SVGElement[]).filter((n) => n.style.opacity === '0')
        expect(hidden).toHaveLength(0)

        const trace = Array.from(svg.querySelectorAll('path')).find((p) => p.getAttribute('stroke') === '#101820')!
        expect(trace.getAttribute('stroke-dasharray')).toBeNull()
        expect(trace.getAttribute('stroke-dashoffset')).toBeNull()
      })
    })

    it('still animates when the tab is in the foreground', () => {
      stubReducedMotion(false)
      withHidden(false, () => {
        const svg = makeSvg()
        drawSignatureStrip(svg)
        const trace = Array.from(svg.querySelectorAll('path')).find((p) => p.getAttribute('stroke') === '#101820')!
        expect(trace.getAttribute('stroke-dasharray')).not.toBeNull()
      })
    })
  })

  describe('spectrum trace draw-in length', () => {
    // The stick path's true length, computed from the seeded geometry, is
    // ~1237.7 user units (34 sticks, summed). The regression these guard: the
    // original code hardcoded a dash length shorter than the real path, so the
    // excess was painted by the *second* dash and visible at rest, then hidden
    // as the reveal ran - "draws to the middle and stops".
    const TRUE_TRACE_LENGTH = 1237.7

    const findTrace = (svg: SVGSVGElement) =>
      Array.from(svg.querySelectorAll('path')).find((p) => p.getAttribute('stroke') === '#101820')!

    it('derives the dash length from getTotalLength rather than a constant', () => {
      stubReducedMotion(false)
      const svg = makeSvg()
      // jsdom has no SVG geometry, so stand in for the browser's measurement.
      const stub = 4321
      const origCreate = document.createElementNS.bind(document)
      const spy = vi.spyOn(document, 'createElementNS').mockImplementation((ns: any, name: any) => {
        const el = origCreate(ns, name)
        if (name === 'path') {
          ;(el as any).getTotalLength = () => stub
        }
        return el
      })

      drawSignatureStrip(svg)
      spy.mockRestore()

      const trace = findTrace(svg)
      const dasharray = Number(trace.getAttribute('stroke-dasharray'))
      const dashoffset = Number(trace.getAttribute('stroke-dashoffset'))
      // Comes from the stubbed measurement (plus a small pad), not 2400 and
      // not the no-geometry fallback.
      expect(dasharray).toBeGreaterThanOrEqual(stub)
      expect(dasharray).toBeLessThan(stub + 20)
      expect(dashoffset).toBe(dasharray)
    })

    it('falls back to a length exceeding the true trace length when geometry is unavailable', () => {
      stubReducedMotion(false)
      const svg = makeSvg()
      drawSignatureStrip(svg)

      const trace = findTrace(svg)
      const dasharray = Number(trace.getAttribute('stroke-dasharray'))
      // Must never be short of the real path, or the tail stays visible at
      // rest and disappears as the stroke draws in.
      expect(dasharray).toBeGreaterThan(TRUE_TRACE_LENGTH)
      expect(dasharray).toBe(DRAW_IN_FALLBACK_LENGTH)
      expect(Number(trace.getAttribute('stroke-dashoffset'))).toBe(dasharray)
    })

    it('measures the trace only after it is attached to its parent', () => {
      stubReducedMotion(false)
      const svg = makeSvg()
      let parentAtMeasure: Node | null | undefined
      const origCreate = document.createElementNS.bind(document)
      const spy = vi.spyOn(document, 'createElementNS').mockImplementation((ns: any, name: any) => {
        const el = origCreate(ns, name)
        if (name === 'path') {
          ;(el as any).getTotalLength = () => {
            parentAtMeasure = el.parentNode
            return 4321
          }
        }
        return el
      })

      drawSignatureStrip(svg)
      spy.mockRestore()

      // An unattached path can measure as 0 in real browsers.
      expect(parentAtMeasure).toBeTruthy()
    })
  })
})

describe('SignatureStrip', () => {
  it('mounts and populates its svg', async () => {
    const wrapper = mount(SignatureStrip)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.element.childElementCount).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('exposes an accessible label', () => {
    const wrapper = mount(SignatureStrip)
    expect(wrapper.find('svg').attributes('role')).toBe('img')
    expect(wrapper.find('svg').attributes('aria-label')).toContain('spectrum')
    wrapper.unmount()
  })
})
