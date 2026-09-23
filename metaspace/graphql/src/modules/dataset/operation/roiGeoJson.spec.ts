import parseRoiGeoJson from './roiGeoJson'

const BOUNDS = { width: 100, height: 100 }

describe('parseRoiGeoJson', () => {
  it('parses a well-formed FeatureCollection (our own export format)', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      metadata: { datasetId: 'ds1', imageWidth: 100, imageHeight: 100 },
      features: [
        {
          type: 'Feature',
          properties: { name: 'Tumor', channel: 'green', rgb: 'rgb(0, 255, 0)' },
          geometry: { type: 'Polygon', coordinates: [[[1, 1], [1, 10], [10, 10], [10, 1], [1, 1]]] },
        },
      ],
    })
    const { features, errors, warnings } = parseRoiGeoJson(geojson, BOUNDS)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(features).toHaveLength(1)
    expect(features[0].name).toBe('Tumor')
    expect(features[0].feature.properties.channel).toBe('green')
    expect(features[0].feature.properties.coordinates).toEqual([
      { x: 1, y: 1 }, { x: 1, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 1 },
    ])
    expect(features[0].feature.geometry.coordinates[0]).toEqual([[1, 1], [1, 10], [10, 10], [10, 1], [1, 1]])
  })

  it('parses a bare Feature', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 5], [5, 5]]] },
    })
    const { features, errors } = parseRoiGeoJson(geojson, BOUNDS)
    expect(errors).toEqual([])
    expect(features).toHaveLength(1)
  })

  it('splits a MultiPolygon into multiple named ROIs and warns', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: { name: 'Region' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [0, 5], [5, 5]]],
          [[[20, 20], [20, 25], [25, 25]]],
        ],
      },
    })
    const { features, errors, warnings } = parseRoiGeoJson(geojson, BOUNDS)
    expect(errors).toEqual([])
    expect(features).toHaveLength(2)
    expect(features.map((f) => f.name)).toEqual(['Region (1)', 'Region (2)'])
    expect(warnings.some((w) => w.message.includes('MultiPolygon split'))).toBe(true)
  })

  it('reuses the internal {x, y} properties.coordinates shape (legacy/own format)', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: {
        name: 'ROI 1',
        coordinates: [{ x: 1, y: 1 }, { x: 1, y: 10 }, { x: 10, y: 10 }],
      },
      geometry: { type: 'Polygon', coordinates: [[1, 1], [1, 10], [10, 10]] }, // legacy malformed flat ring
    })
    const { features, errors } = parseRoiGeoJson(geojson, BOUNDS)
    expect(errors).toEqual([])
    expect(features[0].feature.geometry.coordinates[0]).toEqual([[1, 1], [1, 10], [10, 10], [1, 1]])
  })

  it('closes an open ring without duplicating the closing vertex in properties.coordinates', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[2, 2], [2, 8], [8, 8], [8, 2]]] },
    })
    const { features } = parseRoiGeoJson(geojson, BOUNDS)
    expect(features[0].feature.geometry.coordinates[0]).toEqual([[2, 2], [2, 8], [8, 8], [8, 2], [2, 2]])
    expect(features[0].feature.properties.coordinates).toHaveLength(4)
  })

  it('drops interior rings (holes) with a warning', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[0, 0], [0, 20], [20, 20], [20, 0]],
          [[5, 5], [5, 10], [10, 10]],
        ],
      },
    })
    const { features, errors, warnings } = parseRoiGeoJson(geojson, BOUNDS)
    expect(errors).toEqual([])
    expect(features).toHaveLength(1)
    expect(warnings.some((w) => w.message.includes('holes are not supported'))).toBe(true)
  })

  it('rejects a feature with a vertex outside the dataset image grid', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: { name: 'Out of bounds' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 200], [200, 200]]] },
    })
    const { features, errors } = parseRoiGeoJson(geojson, BOUNDS)
    expect(features).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('outside')
  })

  it('rejects a declared image size that does not match the dataset grid', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      metadata: { imageWidth: 50, imageHeight: 50 },
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 5], [5, 5]]] } },
      ],
    })
    const { features, errors } = parseRoiGeoJson(geojson, BOUNDS)
    expect(features).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('50x50')
  })

  it('rejects a polygon with fewer than 3 distinct vertices', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 5]]] },
    })
    const { features, errors } = parseRoiGeoJson(geojson, BOUNDS)
    expect(features).toHaveLength(0)
    expect(errors[0].message).toContain('at least 3 vertices')
  })

  it('rejects invalid JSON', () => {
    const { features, errors } = parseRoiGeoJson('not json', BOUNDS)
    expect(features).toHaveLength(0)
    expect(errors[0].message).toBe('File is not valid JSON')
  })

  it('rejects an unsupported root type', () => {
    const { features, errors } = parseRoiGeoJson(JSON.stringify({ type: 'LineString', coordinates: [] }), BOUNDS)
    expect(features).toHaveLength(0)
    expect(errors[0].message).toContain('Unsupported GeoJSON type')
  })
})
