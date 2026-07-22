import normalizeLegacyRoiFeature from './normalizeLegacyRoiFeature'

describe('normalizeLegacyRoiFeature', () => {
  it('rebuilds geometry from properties.coordinates into a well-formed Polygon ring', () => {
    const feature = {
      type: 'Feature',
      properties: {
        name: 'ROI 1',
        coordinates: [
          { x: 26, y: 49, isFixed: true },
          { x: 37, y: 36 },
          { x: 51, y: 35 },
        ],
        channel: 'magenta',
      },
      // Legacy malformed geometry: a flat ring, missing the outer array.
      geometry: { type: 'Polygon', coordinates: [[26, 49], [37, 36], [51, 35]] },
    }
    const out = normalizeLegacyRoiFeature(feature)
    expect(out.geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [26, 49],
          [37, 36],
          [51, 35],
        ],
      ],
    })
    // Non-geometry fields are preserved (the annotation viewer reads properties.coordinates).
    expect(out.properties).toBe(feature.properties)
  })

  it('wraps a flat geometry ring when properties.coordinates is absent', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[1, 2], [3, 4], [5, 6]] },
    }
    expect(normalizeLegacyRoiFeature(feature).geometry.coordinates).toEqual([
      [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
    ])
  })

  it('leaves an already well-formed Polygon ring untouched', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [1, 2],
            [3, 4],
            [5, 6],
          ],
        ],
      },
    }
    expect(normalizeLegacyRoiFeature(feature).geometry.coordinates).toEqual([
      [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
    ])
  })
})
