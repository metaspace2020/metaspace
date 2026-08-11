import { clear, drawIn, fadeIn, seededRng, svgEl, svgText, viridis } from './drawing'

// Only the base peak is labelled now; the rest of the key ions get a tick and a
// centroid dot but no text, so the axis stays readable at hero size.
const LABELLED_MZ = '760.5851'
const KEY_PEAK_X = [28.5, 52.4, 71.8, 96.2, 118.6, 141.3]
const LABELLED_PEAK_INDEX = 1

interface Peak {
  x: number
  h: number
  key: boolean
}

const HEADER_LABEL_ATTRS = {
  'font-size': 9,
  fill: '#A85A08',
  'letter-spacing': '0.11em',
}

// Draws one rounded, washed-out panel header bar with a left-aligned label
// and an optional right-aligned one, baseline vertically centred in the bar.
const headerBar = (
  parent: SVGElement,
  x: number,
  y: number,
  left: { text: string; x: number },
  right?: { text: string; x: number }
): void => {
  parent.appendChild(svgEl('rect', { x, y, width: 144, height: 15, rx: 3, fill: '#FEF4E7' }))
  const baseline = y + 10.5
  parent.appendChild(svgText(left.x, baseline, left.text, HEADER_LABEL_ATTRS))
  if (right) {
    parent.appendChild(
      svgText(right.x, baseline, right.text, {
        ...HEADER_LABEL_ATTRS,
        'letter-spacing': '0.02em',
        'text-anchor': 'end',
      })
    )
  }
}

const ARROW_ATTRS = { stroke: '#C6CFD6', 'stroke-width': 1, fill: 'none' }

/**
 * A 14px flow arrow: a shaft plus a three-point chevron head. `dx`/`dy` are the
 * unit direction, so the same call draws the left-to-right, right-to-left and
 * downward arrows that carry the eye around the 2x2 grid.
 */
const flowArrow = (parent: SVGElement, x: number, y: number, dx: number, dy: number, delay: number): void => {
  const x2 = x + dx * 14
  const y2 = y + dy * 14
  // Perpendicular to the shaft, for the chevron's two wings.
  const px = -dy
  const py = dx
  const bx = x2 - dx * 5
  const by = y2 - dy * 5
  parent.appendChild(fadeIn(svgEl('line', { x1: x, y1: y, x2, y2, ...ARROW_ATTRS }), delay))
  parent.appendChild(
    fadeIn(
      svgEl('path', {
        d:
          `M ${(bx + px * 4).toFixed(1)} ${(by + py * 4).toFixed(1)}` +
          ` L ${x2.toFixed(1)} ${y2.toFixed(1)}` +
          ` L ${(bx - px * 4).toFixed(1)} ${(by - py * 4).toFixed(1)}`,
        ...ARROW_ATTRS,
      }),
      delay
    )
  )
}

/**
 * Draws the hero figure: a 2x2 grid of self-labelled panels - a centroided m/z
 * spectrum, the annotated ion image for m/z 760.5851, a differential test
 * between two regions of interest, and a cross-dataset heatmap - connected by
 * flow arrows that run clockwise from the top left, with a shared ROI legend at
 * the foot. Fixed at a 340x380 viewBox and scaled by CSS; there is no separate
 * wide/narrow layout.
 */
export const drawSignatureStrip = (svg: SVGSVGElement): void => {
  clear(svg)
  svg.setAttribute('viewBox', '0 0 340 380')
  const r = seededRng(20261103)

  const gHeaders = svgEl('g')
  const gSpectrum = svgEl('g')
  const gImage = svgEl('g')
  const gVolcano = svgEl('g')
  const gCross = svgEl('g')
  const gFlow = svgEl('g')
  svg.appendChild(gHeaders)
  svg.appendChild(gSpectrum)
  svg.appendChild(gImage)
  svg.appendChild(gVolcano)
  svg.appendChild(gCross)
  svg.appendChild(gFlow)

  // --- panel header bars -------------------------------------------------
  headerBar(gHeaders, 14, 3, { text: 'M/Z SPECTRUM', x: 22 })
  headerBar(gHeaders, 182, 3, { text: 'ANNOTATION', x: 190 }, { text: 'FDR ≤ 5%', x: 318 })
  headerBar(gHeaders, 14, 203, { text: 'CROSS-DATASET', x: 22 })
  headerBar(gHeaders, 182, 203, { text: 'ROI A VS B', x: 190 })

  // --- top left: centroided m/z spectrum ----------------------------------
  // Centroided data is a list of (m/z, intensity) pairs, not a continuous
  // profile, so the spectrum is drawn as independent vertical sticks with a
  // dot at each apex rather than as one connected trace.
  const BASE = 150
  const SPEC_START = 14
  const SPEC_END = 156

  gSpectrum.appendChild(
    svgEl('line', { x1: SPEC_START, y1: BASE, x2: SPEC_END, y2: BASE, stroke: '#E2E8ED', 'stroke-width': 1 })
  )

  const peaks: Peak[] = []
  let x = SPEC_START + 4
  while (x < SPEC_END - 4) {
    peaks.push({ x, h: Math.pow(r(), 2.6) * 68 + 2.5, key: false })
    x += 2.8 + r() * 4.2
  }
  KEY_PEAK_X.forEach((keyX) => {
    peaks.push({ x: keyX, h: 76 + r() * 22, key: true })
  })
  peaks.sort((a, b) => a.x - b.x)

  // Snap to the same precision the path data uses, so each centroid dot lands
  // exactly on its stick tip rather than a hair above or below it.
  const round1 = (v: number): number => Math.round(v * 10) / 10
  const apexes = peaks.map((p) => ({ x: round1(p.x), y: round1(BASE - p.h), key: p.key }))

  // One path of `M x base L x apex` pairs - no horizontal runs joining them,
  // which is what separates a centroid stick plot from a profile trace.
  const d = apexes.map((a) => `M ${a.x} ${BASE} L ${a.x} ${a.y}`).join(' ')

  const sticks = svgEl('path', {
    d,
    fill: 'none',
    stroke: '#101820',
    'stroke-width': 1,
    'stroke-linecap': 'butt',
  }) as SVGPathElement
  // Append first: the dash reveal measures the real path length off the live
  // node, and an unattached path can measure as 0.
  gSpectrum.appendChild(sticks)
  drawIn(sticks, 'stroke-dashoffset 2s cubic-bezier(.3,.7,.3,1)')

  // The orange apex dots are the visual signature of centroided data. They are
  // staggered left to right so the panel still reads as arriving across the
  // mass range, which the dash reveal alone cannot express: SVG restarts a dash
  // pattern at every subpath, so all the sticks uncover together.
  const span = SPEC_END - SPEC_START
  apexes.forEach((a) => {
    gSpectrum.appendChild(
      fadeIn(
        svgEl('circle', { cx: a.x, cy: a.y, r: a.key ? 1.7 : 1.15, fill: '#F0961F' }),
        0.2 + ((a.x - SPEC_START) / span) * 1.4,
        0.3
      )
    )
  })

  KEY_PEAK_X.forEach((keyX, i) => {
    gSpectrum.appendChild(
      fadeIn(
        svgEl('line', { x1: keyX, y1: 152, x2: keyX, y2: 161, stroke: '#C6CFD6', 'stroke-width': 1 }),
        1.5 + i * 0.04
      )
    )
  })
  gSpectrum.appendChild(
    fadeIn(
      svgText(KEY_PEAK_X[LABELLED_PEAK_INDEX], 170, LABELLED_MZ, {
        'text-anchor': 'middle',
        'font-size': 8.5,
        fill: '#101820',
      }),
      1.6
    )
  )
  gSpectrum.appendChild(
    fadeIn(svgText(SPEC_END, 170, '(centroided)', { 'text-anchor': 'end', 'font-size': 7, fill: '#7C8892' }), 1.65)
  )

  gSpectrum.setAttribute('transform', 'translate(0,-8)')

  // --- top right: annotated ion image -------------------------------------
  const cols = 18
  const rows = 12
  const cell = 6.6
  const gap = 1.1
  const x0 = 186
  const y0 = 46
  const imgW = cols * (cell + gap) - gap
  const imgH = rows * (cell + gap) - gap

  gImage.appendChild(fadeIn(svgText(x0, 36, 'm/z 760.5851', { 'font-size': 9.5, fill: '#101820' }), 0.9))

  const cellGroup = svgEl('g')
  gImage.appendChild(cellGroup)
  for (let c = 0; c < cols; c++) {
    for (let row = 0; row < rows; row++) {
      const nx = c / cols - 0.4
      const ny = row / rows - 0.5
      const lobe1 = Math.exp(-((nx * nx) / 0.05 + (ny * ny) / 0.1))
      const lobe2 = Math.exp(-(((nx - 0.38) * (nx - 0.38)) / 0.026 + ((ny + 0.1) * (ny + 0.1)) / 0.048))
      const v = lobe1 * 0.95 + lobe2 * 0.8 + r() * 0.13 - 0.06
      if (v < 0.06) {
        continue
      }
      cellGroup.appendChild(
        fadeIn(
          svgEl('rect', {
            x: x0 + c * (cell + gap),
            y: y0 + row * (cell + gap),
            width: cell,
            height: cell,
            rx: 1.1,
            fill: viridis(v),
          }),
          1.1 + c * 0.018 + row * 0.005,
          0.5
        )
      )
    }
  }

  // ROI boxes get a white halo so their outline reads against the viridis
  // fill, then a dark stroke on top. ROI A is solid, ROI B is dashed; the
  // names themselves live only in the shared legend below, not on the boxes.
  const roi = svgEl('g')
  const roiBox = (rx: number, ry: number, w: number, h: number, dashed: boolean): void => {
    const dash = dashed ? { 'stroke-dasharray': '3 3' } : {}
    roi.appendChild(
      svgEl('rect', {
        x: rx,
        y: ry,
        width: w,
        height: h,
        rx: 4,
        fill: 'none',
        stroke: '#FFFFFF',
        'stroke-width': 2.2,
        'stroke-opacity': 0.9,
        ...dash,
      })
    )
    roi.appendChild(
      svgEl('rect', {
        x: rx,
        y: ry,
        width: w,
        height: h,
        rx: 4,
        fill: 'none',
        stroke: '#101820',
        'stroke-width': 1,
        ...dash,
      })
    )
  }
  roiBox(x0 + 10, y0 + imgH * 0.24, imgW * 0.29, imgH * 0.52, false)
  roiBox(x0 + imgW * 0.6, y0 + imgH * 0.3, imgW * 0.27, imgH * 0.44, true)
  gImage.appendChild(fadeIn(roi, 1.75))

  gImage.appendChild(
    fadeIn(svgEl('line', { x1: x0, y1: 152, x2: x0 + 46, y2: 152, stroke: '#B4BCC4', 'stroke-width': 2 }), 1.75)
  )
  gImage.appendChild(fadeIn(svgText(x0 + 52, 155.5, '500 µm', { 'font-size': 9, fill: '#7C8892' }), 1.75))

  // --- bottom right: differential test between the two ROIs ---------------
  const vx = 192
  const vr = 320
  const vt = 228
  const vb = 322
  const threshold = 272

  const vol = svgEl('g')
  vol.appendChild(svgEl('line', { x1: vx, y1: vt, x2: vx, y2: vb, stroke: '#C6CFD6' }))
  vol.appendChild(svgEl('line', { x1: vx, y1: vb, x2: vr, y2: vb, stroke: '#C6CFD6' }))
  vol.appendChild(
    svgEl('line', { x1: vx, y1: threshold, x2: vr, y2: threshold, stroke: '#D6DDE3', 'stroke-dasharray': '3 3' })
  )
  vol.appendChild(svgText(vx + 5, threshold + 10, 'q .05', { 'font-size': 8, fill: '#55636E' }))

  const vcx = (vx + vr) / 2
  const vsp = (vr - vx) * 0.44
  for (let i = 0; i < 86; i++) {
    const fx = (r() - 0.5) * 2
    const cy = vb - (Math.pow(Math.abs(fx), 1.6) * (vb - vt - 10) * r() + r() * 22)
    const cx = vcx + fx * vsp
    if (cy < vt + 2 || cx < vx + 6 || cx > vr - 4) {
      continue
    }
    const hit = cy < threshold - 4 && Math.abs(fx) > 0.45
    vol.appendChild(
      svgEl('circle', {
        cx,
        cy,
        r: hit ? 3 : 2.1,
        fill: hit ? (fx > 0 ? '#F0961F' : '#1668C7') : '#AEB8C0',
        'fill-opacity': hit ? 1 : 0.72,
      })
    )
  }
  gVolcano.appendChild(fadeIn(vol, 1.95, 0.6))
  gVolcano.appendChild(
    fadeIn(svgText(186, 334, '14 metabolites · q < 0.05', { 'font-size': 8, fill: '#7C8892' }), 2.15)
  )

  // --- bottom left: cross-dataset heatmap ---------------------------------
  const hCols = 12
  const hRows = 8
  const hCell = 8.8
  const hPitch = 10
  const hx0 = 26
  const hy0 = 244
  // Grid height less the trailing inter-cell gap, so the block separators span
  // exactly the painted cells.
  const hH = hRows * hPitch - (hPitch - hCell)
  const blockCols = hCols / 3
  // Each condition sits at its own intensity level, so the three blocks read as
  // "up, down, part-way back" rather than as one undifferentiated field.
  const blockBase = [0.68, 0.3, 0.52]

  for (let c = 0; c < hCols; c++) {
    for (let row = 0; row < hRows; row++) {
      const block = Math.floor(c / blockCols)
      const v = Math.max(0, Math.min(1, blockBase[block] + (r() - 0.5) * 0.5))
      gCross.appendChild(
        fadeIn(
          svgEl('rect', { x: hx0 + c * hPitch, y: hy0 + row * hPitch, width: hCell, height: hCell, fill: viridis(v) }),
          2.15 + c * 0.02 + row * 0.006,
          0.4
        )
      )
    }
  }

  // White rules between the condition blocks, so the grouping is legible
  // without adding another axis.
  for (let b = 1; b < 3; b++) {
    const sx = hx0 + b * blockCols * hPitch - (hPitch - hCell) / 2
    gCross.appendChild(
      fadeIn(svgEl('line', { x1: sx, y1: hy0, x2: sx, y2: hy0 + hH, stroke: '#FFFFFF', 'stroke-width': 1.6 }), 2.45)
    )
  }
  ;['ctrl', 'treat', 'recov'].forEach((label, i) => {
    gCross.appendChild(
      fadeIn(
        svgText(hx0 + i * blockCols * hPitch + (blockCols * hPitch - (hPitch - hCell)) / 2, 238, label, {
          'text-anchor': 'middle',
          'font-size': 7.5,
          fill: '#7C8892',
        }),
        2.2 + i * 0.05
      )
    )
  })
  gCross.appendChild(fadeIn(svgText(hx0, 334, '40 datasets · 3 conditions', { 'font-size': 8, fill: '#7C8892' }), 2.5))

  // --- flow arrows, ROI legend and figure caption -------------------------
  // The eye runs clockwise: spectrum, annotation, differential test, then back
  // across to the cross-dataset view.
  flowArrow(gFlow, 163, 90, 1, 0, 1.55)
  flowArrow(gFlow, 254, 170, 0, 1, 2.05)
  flowArrow(gFlow, 177, 280, -1, 0, 2.5)

  gFlow.appendChild(
    fadeIn(svgEl('line', { x1: 14, y1: 350, x2: 27, y2: 350, stroke: '#101820', 'stroke-width': 1.3 }), 2.65)
  )
  gFlow.appendChild(fadeIn(svgText(32, 353.5, 'ROI A', { 'font-size': 8.5, fill: '#7C8892' }), 2.65))
  gFlow.appendChild(
    fadeIn(
      svgEl('line', {
        x1: 76,
        y1: 350,
        x2: 89,
        y2: 350,
        stroke: '#101820',
        'stroke-width': 1.3,
        'stroke-dasharray': '3 3',
      }),
      2.65
    )
  )
  gFlow.appendChild(fadeIn(svgText(94, 353.5, 'ROI B', { 'font-size': 8.5, fill: '#7C8892' }), 2.65))

  gFlow.appendChild(
    fadeIn(
      svgText(170, 370, 'downstream analysis · in the browser', {
        'text-anchor': 'middle',
        'font-size': 8,
        fill: '#7C8892',
        'letter-spacing': '0.06em',
      }),
      2.75
    )
  )
}
