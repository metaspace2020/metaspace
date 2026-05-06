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
})
