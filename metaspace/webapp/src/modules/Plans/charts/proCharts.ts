import { clear, seededRng, svgEl, svgText, viridis } from './drawing'

const VIEWBOX = '0 0 520 300'

/** Volcano plot: log2 fold change against -log10 q, hits coloured by direction. */
export const drawVolcano = (svg: SVGSVGElement): void => {
  clear(svg)
  svg.setAttribute('viewBox', VIEWBOX)
  const r = seededRng(77)

  svg.appendChild(svgEl('line', { x1: 60, y1: 250, x2: 480, y2: 250, stroke: '#D6DDE3' }))
  svg.appendChild(svgEl('line', { x1: 60, y1: 30, x2: 60, y2: 250, stroke: '#D6DDE3' }))
  svg.appendChild(svgEl('line', { x1: 270, y1: 30, x2: 270, y2: 250, stroke: '#E2E8ED', 'stroke-dasharray': '3 4' }))
  svg.appendChild(svgEl('line', { x1: 60, y1: 110, x2: 480, y2: 110, stroke: '#E2E8ED', 'stroke-dasharray': '3 4' }))

  for (let i = 0; i < 210; i++) {
    const fx = (r() - 0.5) * 2
    const significance = Math.pow(Math.abs(fx), 1.5)
    const cx = 270 + fx * 195
    const cy = 250 - (significance * 180 * r() + r() * 40)
    if (cy < 28 || cx < 64 || cx > 476) {
      continue
    }
    const hit = cy < 108 && Math.abs(fx) > 0.42
    svg.appendChild(
      svgEl('circle', {
        cx,
        cy,
        r: hit ? 3.4 : 2.4,
        fill: hit ? (fx > 0 ? '#F0961F' : '#1668C7') : '#C6CFD6',
        'fill-opacity': hit ? 0.95 : 0.55,
      })
    )
  }

  svg.appendChild(svgText(270, 274, 'log₂ fold change', { 'text-anchor': 'middle', 'font-size': 10 }))
  svg.appendChild(svgText(22, 140, '−log₁₀ q', { 'font-size': 10, transform: 'rotate(-90 22 140)' }))
}

/** Spatial segmentation: four compartments assigned by nearest seeded centroid. */
export const drawSegmentation = (svg: SVGSVGElement): void => {
  clear(svg)
  svg.setAttribute('viewBox', VIEWBOX)
  const r = seededRng(404)

  const cols = 34
  const rows = 20
  const cell = 12
  const gap = 1.4
  const x0 = 42
  const y0 = 28
  // Seeded jitter on the compartment centroids, not on the per-cell distances:
  // the layout still varies with the seed, but every cell in a neighbourhood
  // resolves to the same compartment.
  const centroids = [
    [0.28, 0.36],
    [0.66, 0.3],
    [0.5, 0.72],
    [0.16, 0.74],
  ].map(([px, py]) => [px + (r() - 0.5) * 0.05, py + (r() - 0.5) * 0.05])
  const colours = ['#440154', '#31688E', '#35B779', '#FDE725']

  for (let c = 0; c < cols; c++) {
    for (let row = 0; row < rows; row++) {
      const nx = c / cols
      const ny = row / rows
      const dx = nx - 0.46
      const dy = ny - 0.5
      // Tissue mask: an ellipse with a low-frequency lobe on its radius, so the
      // outline reads as a section of tissue rather than as a perfect ellipse.
      const angle = Math.atan2(dy, dx)
      const lobed = 1 + 0.13 * Math.sin(angle * 3 + 0.6) + 0.07 * Math.cos(angle * 2 - 1.1)
      if ((dx * dx) / 0.13 + (dy * dy) / 0.2 > lobed) {
        continue
      }
      let best = 0
      let bestDist = 9
      centroids.forEach((p, i) => {
        // The warp is a smooth function of position, so it bends the boundaries
        // between compartments into organic curves while keeping each
        // compartment a single connected region - per-cell random noise here
        // would speckle one compartment's colour through its neighbour.
        const warp = Math.sin(nx * 9 + i * 2.1) * 0.018 + Math.cos(ny * 8 + i * 1.7) * 0.018
        const dist = Math.hypot(nx - p[0], ny - p[1]) + warp
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      })
      svg.appendChild(
        svgEl('rect', {
          x: x0 + c * (cell + gap),
          y: y0 + row * (cell + gap),
          width: cell,
          height: cell,
          rx: 1.5,
          fill: colours[best],
          'fill-opacity': 0.88,
        })
      )
    }
  }
}

/** Cross-dataset heatmap: three condition blocks by twelve annotation rows. */
export const drawHeatmap = (svg: SVGSVGElement): void => {
  clear(svg)
  svg.setAttribute('viewBox', VIEWBOX)
  const r = seededRng(909)

  const cols = 18
  const rows = 12
  const cw = 22
  const ch = 17
  const x0 = 76
  const y0 = 34
  const blockBase = [0.72, 0.34, 0.55]

  for (let c = 0; c < cols; c++) {
    for (let row = 0; row < rows; row++) {
      const block = c < 6 ? 0 : c < 12 ? 1 : 2
      const v = Math.max(0, Math.min(1, blockBase[block] + (r() - 0.5) * 0.62))
      svg.appendChild(
        svgEl('rect', { x: x0 + c * cw, y: y0 + row * ch, width: cw - 1.4, height: ch - 1.4, fill: viridis(v) })
      )
    }
  }

  ;['control', 'treated', 'recovery'].forEach((label, i) => {
    svg.appendChild(svgText(x0 + i * 6 * cw + 3 * cw, 26, label, { 'text-anchor': 'middle', 'font-size': 10 }))
  })

  for (let row = 0; row < 5; row++) {
    svg.appendChild(
      svgText(70, y0 + row * ch * 2.4 + 14, `PC(${32 + row * 2}:1)`, {
        'text-anchor': 'end',
        'font-size': 9,
        fill: '#B4BCC4',
      })
    )
  }
}

export const CHART_DRAWERS = {
  volcano: drawVolcano,
  segmentation: drawSegmentation,
  heatmap: drawHeatmap,
}

export type ProChartKind = keyof typeof CHART_DRAWERS
