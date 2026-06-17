import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import DatasetIonImagePreview from './DatasetIonImagePreview'

describe('DatasetIonImagePreview', () => {
  const props = {
    ionImageUrl: '/tic.png',
    opticalImageUrl: '/optical.png',
    overlays: [
      { id: 'a', label: 'Cluster 0', color: '#1f77b4', visible: true, maskUrl: '/m0.png' },
      { id: 'b', label: 'Cluster 1', color: '#2ca02c', visible: false, maskUrl: '/m1.png' },
    ],
  }

  it('renders the ion thumbnail when shown', () => {
    const w = mount(DatasetIonImagePreview, { props: { ...props, shown: true } })
    expect(w.find('[data-test-key="ion-image-tic"]').attributes('src')).toBe('/tic.png')
  })

  it('hides everything when shown=false', () => {
    const w = mount(DatasetIonImagePreview, { props: { ...props, shown: false } })
    expect(w.find('[data-test-key="ion-image-tic"]').exists()).toBe(false)
  })

  it('renders only visible overlays', () => {
    const w = mount(DatasetIonImagePreview, { props: { ...props, shown: true } })
    const overlays = w.findAll('[data-test-key^="overlay-"]')
    expect(overlays).toHaveLength(1)
    expect(overlays[0].attributes('data-test-key')).toBe('overlay-a')
  })

  it('renders an <img> overlay when maskUrl is present and no geojson', () => {
    const w = mount(DatasetIonImagePreview, {
      props: {
        ionImageUrl: '/tic.png',
        opticalImageUrl: null,
        shown: true,
        overlays: [{ id: 'seg-1', label: 'Cluster 0', color: '#1f77b4', visible: true, maskUrl: '/mask.png' }],
      },
    })
    const img = w.find('[data-test-key="overlay-seg-1"]')
    expect(img.exists()).toBe(true)
    expect(img.element.tagName).toBe('IMG')
    expect(img.attributes('src')).toBe('/mask.png')
  })

  it('renders an SVG layer when an overlay has geojson and is visible', () => {
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    })
    const w = mount(DatasetIonImagePreview, {
      props: {
        ionImageUrl: '/tic.png',
        opticalImageUrl: null,
        shown: true,
        overlays: [{ id: 'roi-1', label: 'Tumor', color: '#ff0000', visible: true, maskUrl: null, geojson }],
      },
    })
    expect(w.find('[data-test-key="overlay-roi-1-svg"]').exists()).toBe(true)
    expect(w.find('svg polygon').exists()).toBe(true)
  })

  it('draws the ROI border as solid pixel cells tracing the drawn edges', () => {
    // Mirrors the annotation viewer's pixel brush: rasterize each segment between
    // consecutive vertices into grid cells and render them as solid unit rects, so the
    // border follows the polygon's straight sides (no jagged region-boundary notches).
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1],
        ],
      ],
    })
    const w = mount(DatasetIonImagePreview, {
      props: {
        ionImageUrl: '/tic.png',
        opticalImageUrl: null,
        imageWidth: 50,
        imageHeight: 50,
        shown: true,
        overlays: [{ id: 'roi-1', label: 'Tumor', color: '#ff0000', visible: true, maskUrl: null, geojson }],
      },
    })
    const border = w.find('[data-test-key="overlay-roi-1-border"]')
    expect(border.exists()).toBe(true)
    expect(border.attributes('fill')).toBe('#ff0000')
    const d = border.attributes('d') ?? ''
    const cells = new Set((d.match(/M(-?\d+) (-?\d+)/g) ?? []).map((m) => m.slice(1)))
    // Every cell along the four traced edges must be present (border thickness only
    // ever adds cells, so these hold regardless of BORDER_WIDTH_CELLS).
    for (const c of ['1 1', '2 1', '3 1', '3 2', '3 3', '2 3', '1 3', '1 2']) {
      expect(cells.has(c)).toBe(true)
    }
  })

  it('skips the closing edge for an unclosed ring so no diagonal tail is drawn', () => {
    // The annotation viewer never strokes the edge from the last vertex back to the
    // first. An unclosed L-shaped path must therefore not produce any border cell on
    // that closing diagonal. Use a large triangle so the diagonal's midpoint stays far
    // from the drawn edges (and thus clear of any border-thickness dilation).
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [20, 0],
          [20, 20],
        ],
      ],
    })
    const w = mount(DatasetIonImagePreview, {
      props: {
        ionImageUrl: '/tic.png',
        opticalImageUrl: null,
        imageWidth: 50,
        imageHeight: 50,
        shown: true,
        overlays: [{ id: 'roi-1', label: 'Tumor', color: '#ff0000', visible: true, maskUrl: null, geojson }],
      },
    })
    const d = w.find('[data-test-key="overlay-roi-1-border"]').attributes('d') ?? ''
    const cells = new Set((d.match(/M(-?\d+) (-?\d+)/g) ?? []).map((m) => m.slice(1)))
    // Top edge (0,0)->(20,0) and right edge (20,0)->(20,20) are drawn...
    expect(cells.has('10 0')).toBe(true)
    expect(cells.has('20 10')).toBe(true)
    // ...but the closing diagonal (20,20)->(0,0) is NOT, so its midpoint is absent.
    expect(cells.has('10 10')).toBe(false)
  })

  it('letterboxes the ROI overlay to match the object-contain ion image', () => {
    // The ion <img> uses object-contain + w-full/max-height, so when the element
    // box is not square the bitmap is centered and scaled uniformly. The overlay
    // SVG must do the same (preserve aspect ratio) or ROIs render stretched and
    // offset from the underlying image. A value of "none" stretches and is wrong.
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    })
    const w = mount(DatasetIonImagePreview, {
      props: {
        ionImageUrl: '/tic.png',
        opticalImageUrl: null,
        imageWidth: 50,
        imageHeight: 50,
        shown: true,
        overlays: [{ id: 'roi-1', label: 'Tumor', color: '#ff0000', visible: true, maskUrl: null, geojson }],
      },
    })
    const svg = w.find('[data-test-key="overlay-roi-1-svg"]')
    expect(svg.attributes('preserveAspectRatio')).toBe('xMidYMid meet')
  })

  it('offsets ROI vertices to pixel centers so the overlay aligns cell-for-cell', () => {
    // A vertex (x, y) is a pixel index; the ion thumbnail centers that cell at
    // (x + 0.5, y + 0.5). The annotation viewer draws through pixel centers, so the
    // overlay must too — otherwise it sits half a cell up-left and leaves edges bare.
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [3, 2],
          [20, 2],
          [20, 19],
          [3, 19],
        ],
      ],
    })
    const w = mount(DatasetIonImagePreview, {
      props: {
        ionImageUrl: '/tic.png',
        opticalImageUrl: null,
        imageWidth: 50,
        imageHeight: 50,
        shown: true,
        overlays: [{ id: 'roi-1', label: 'Tumor', color: '#ff0000', visible: true, maskUrl: null, geojson }],
      },
    })
    const polygon = w.find('[data-test-key="overlay-roi-1-svg"] polygon')
    expect(polygon.attributes('points')).toBe('3.5,2.5 20.5,2.5 20.5,19.5 3.5,19.5')
  })

  it('renders legacy Polygon geojson whose coordinates are a flat ring (missing a nesting level)', () => {
    // Legacy ROIs (from the engine `dataset.roi` column) store malformed GeoJSON where
    // a Polygon's `coordinates` is a single flat ring `[[x,y],...]` instead of an array
    // of rings `[[[x,y],...]]`. The parser must treat that as one ring, not iterate the
    // points as if each were a ring (which produced NaN coordinates and no overlay).
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [3, 2],
        [20, 2],
        [20, 19],
        [3, 19],
      ],
    })
    const w = mount(DatasetIonImagePreview, {
      props: {
        ionImageUrl: '/tic.png',
        opticalImageUrl: null,
        imageWidth: 50,
        imageHeight: 50,
        shown: true,
        overlays: [{ id: 'roi-1', label: 'Tumor', color: '#ff0000', visible: true, maskUrl: null, geojson }],
      },
    })
    const polygon = w.find('[data-test-key="overlay-roi-1-svg"] polygon')
    expect(polygon.exists()).toBe(true)
    expect(polygon.attributes('points')).toBe('3.5,2.5 20.5,2.5 20.5,19.5 3.5,19.5')
  })
})
