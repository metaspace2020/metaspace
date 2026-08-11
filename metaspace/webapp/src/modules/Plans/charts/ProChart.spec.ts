import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProChart from './ProChart'
import { drawVolcano, drawSegmentation, drawHeatmap } from './proCharts'

const makeSvg = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement

describe('proCharts', () => {
  it('drawVolcano plots points and axis labels', () => {
    const svg = makeSvg()
    drawVolcano(svg)
    expect(svg.querySelectorAll('circle').length).toBeGreaterThan(50)
    expect(svg.textContent).toContain('fold change')
  })

  it('drawVolcano sets the chart viewBox', () => {
    const svg = makeSvg()
    drawVolcano(svg)
    expect(svg.getAttribute('viewBox')).toBe('0 0 520 300')
  })

  it('drawVolcano is idempotent - drawing twice does not duplicate content', () => {
    const svg = makeSvg()
    drawVolcano(svg)
    const firstCount = svg.querySelectorAll('circle').length
    drawVolcano(svg)
    expect(svg.querySelectorAll('circle').length).toBe(firstCount)
  })

  it('drawSegmentation fills an elliptical tissue mask', () => {
    const svg = makeSvg()
    drawSegmentation(svg)
    const rects = svg.querySelectorAll('rect')
    expect(rects.length).toBeGreaterThan(100)
  })

  it('drawSegmentation sets the chart viewBox', () => {
    const svg = makeSvg()
    drawSegmentation(svg)
    expect(svg.getAttribute('viewBox')).toBe('0 0 520 300')
  })

  it('drawSegmentation is idempotent - drawing twice does not duplicate content', () => {
    const svg = makeSvg()
    drawSegmentation(svg)
    const firstCount = svg.querySelectorAll('rect').length
    drawSegmentation(svg)
    expect(svg.querySelectorAll('rect').length).toBe(firstCount)
  })

  it('drawSegmentation excludes background cells outside the tissue mask', () => {
    const svg = makeSvg()
    drawSegmentation(svg)
    // Grid is 34 cols x 20 rows = 680 cells; the tissue mask must exclude some
    // of them (the corners), so the rendered rect count is strictly less than
    // the full grid.
    expect(svg.querySelectorAll('rect').length).toBeLessThan(34 * 20)
  })

  it('drawSegmentation paints four compartments, each a single contiguous region', () => {
    const svg = makeSvg()
    drawSegmentation(svg)

    const PITCH = 13.4
    const grid = new Map<string, string>()
    Array.from(svg.querySelectorAll('rect')).forEach((rect) => {
      const c = Math.round((Number(rect.getAttribute('x')) - 42) / PITCH)
      const row = Math.round((Number(rect.getAttribute('y')) - 28) / PITCH)
      grid.set(`${c},${row}`, rect.getAttribute('fill')!)
    })

    // Flood-fill each colour. The regression this guards: jittering the
    // per-cell distance to the nearest centroid speckles one compartment's
    // colour through its neighbours, so a "segmentation" reads as noise rather
    // than as anatomy.
    const seen = new Set<string>()
    const componentsByColour = new Map<string, number>()
    grid.forEach((colour, key) => {
      if (seen.has(key)) {
        return
      }
      seen.add(key)
      const stack = [key]
      while (stack.length) {
        const [c, row] = stack.pop()!.split(',').map(Number)
        ;[
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].forEach(([dc, dr]) => {
          const next = `${c + dc},${row + dr}`
          if (grid.get(next) === colour && !seen.has(next)) {
            seen.add(next)
            stack.push(next)
          }
        })
      }
      componentsByColour.set(colour, (componentsByColour.get(colour) || 0) + 1)
    })

    expect(Array.from(componentsByColour.keys()).sort()).toEqual(['#31688E', '#35B779', '#440154', '#FDE725'])
    componentsByColour.forEach((count) => expect(count).toBe(1))
  })

  it('drawSegmentation masks the grid into a tissue blob rather than an ellipse', () => {
    const svg = makeSvg()
    drawSegmentation(svg)
    // Row widths must vary irregularly. A bare ellipse is symmetric about its
    // centre row; the lobed radius breaks that.
    const widths = new Map<number, number>()
    Array.from(svg.querySelectorAll('rect')).forEach((rect) => {
      const row = Math.round((Number(rect.getAttribute('y')) - 28) / 13.4)
      widths.set(row, (widths.get(row) || 0) + 1)
    })
    const rows = Array.from(widths.keys()).sort((a, b) => a - b)
    const asymmetric = rows.filter((row) => widths.get(row) !== widths.get(rows[rows.length - 1] - row + rows[0]))
    expect(asymmetric.length).toBeGreaterThan(0)
  })

  it('drawHeatmap renders the condition columns and ion rows', () => {
    const svg = makeSvg()
    drawHeatmap(svg)
    expect(svg.querySelectorAll('rect').length).toBe(216)
    expect(svg.textContent).toContain('control')
    expect(svg.textContent).toContain('PC(32:1)')
  })

  it('drawHeatmap sets the chart viewBox', () => {
    const svg = makeSvg()
    drawHeatmap(svg)
    expect(svg.getAttribute('viewBox')).toBe('0 0 520 300')
  })

  it('drawHeatmap is idempotent - drawing twice does not duplicate content', () => {
    const svg = makeSvg()
    drawHeatmap(svg)
    const firstCount = svg.querySelectorAll('rect').length
    drawHeatmap(svg)
    expect(svg.querySelectorAll('rect').length).toBe(firstCount)
  })
})

describe('ProChart', () => {
  it.each(['volcano', 'segmentation', 'heatmap'] as const)('renders the %s chart', (kind) => {
    const wrapper = mount(ProChart, { props: { kind } })
    expect(wrapper.find('svg').element.childElementCount).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('never renders a placeholder bar - the tool visuals have no header chrome', () => {
    const wrapper = mount(ProChart, { props: { kind: 'volcano' } })
    expect(wrapper.find('.pro-chart__bar').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Placeholder')
  })
})
