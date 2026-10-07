import parseRoiGeoJson, { MAX_GEOJSON_BYTES } from './roiGeoJson'

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

  it('treats a missing/null axis in legacy vertices as 0 (edge vertices persisted as {x: N} / [N, null])', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: { name: 'Edge', coordinates: [{ x: 5 }, { x: 5, y: 10 }, { x: 10, y: 10 }] },
      geometry: { type: 'Polygon', coordinates: [[[5, null], [5, 10], [10, 10], [5, null]]] },
    })
    const { features, errors } = parseRoiGeoJson(geojson, BOUNDS)
    expect(errors).toEqual([])
    expect(features[0].feature.properties.coordinates).toEqual([{ x: 5, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 10 }])
    expect(features[0].feature.geometry.coordinates[0]).toEqual([[5, 0], [5, 10], [10, 10], [5, 0]])
  })

  it('derives fill/stroke from the channel colour when rgb is not an rgb() literal', () => {
    const withRgb = (rgb: string) => parseRoiGeoJson(JSON.stringify({
      type: 'Feature',
      properties: { name: 'c', rgb },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 5], [5, 5]]] },
    }), BOUNDS).features[0].feature.properties
    expect(withRgb('rgb(1, 2, 3)')).toMatchObject({ color: 'rgba(1, 2, 3, 0.4)', strokeColor: 'rgba(1, 2, 3, 0)' })
    // hex / rgba inputs cannot be rewritten into rgba(); fall back to the (magenta) channel colour
    expect(withRgb('#f00')).toMatchObject({ rgb: '#f00', color: 'rgba(255, 0, 255, 0.4)', strokeColor: 'rgba(255, 0, 255, 0)' })
    expect(withRgb('rgba(1, 2, 3, 1)')).toMatchObject({ color: 'rgba(255, 0, 255, 0.4)' })
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

  it('rejects a MultiPolygon containing a null/malformed polygon instead of throwing', () => {
    const { features, errors } = parseRoiGeoJson(JSON.stringify({ type: 'MultiPolygon', coordinates: [null, 5] }), BOUNDS)
    expect(features).toHaveLength(0)
    expect(errors).toHaveLength(2)
    expect(errors[0].message).toContain('empty or malformed polygon')
  })

  it('rejects a non-string or over-long name', () => {
    const withName = (name: any) => JSON.stringify({
      type: 'Feature',
      properties: { name },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 5], [5, 5]]] },
    })
    expect(parseRoiGeoJson(withName({ a: 1 }), BOUNDS).errors[0].message).toContain('must be a non-empty string')
    expect(parseRoiGeoJson(withName(42), BOUNDS).errors[0].message).toContain('must be a non-empty string')
    expect(parseRoiGeoJson(withName('   '), BOUNDS).errors[0].message).toContain('must be a non-empty string')
    expect(parseRoiGeoJson(withName('x'.repeat(201)), BOUNDS).errors[0].message).toContain('longer than 200')
    // Missing/empty names fall back to a default
    expect(parseRoiGeoJson(withName(undefined), BOUNDS).features[0].name).toBe('Imported ROI 1')
    expect(parseRoiGeoJson(withName(''), BOUNDS).features[0].name).toBe('Imported ROI 1')
    expect(parseRoiGeoJson(withName('  Tumor '), BOUNDS).features[0].name).toBe('Tumor')
  })

  it('rejects non-CSS-colour rgb/color/strokeColor values instead of throwing', () => {
    const withProps = (properties: any) => JSON.stringify({
      type: 'Feature',
      properties,
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 5], [5, 5]]] },
    })
    expect(parseRoiGeoJson(withProps({ rgb: 123 }), BOUNDS).errors[0].message).toContain('"rgb" is not a valid CSS colour')
    expect(parseRoiGeoJson(withProps({ color: {} }), BOUNDS).errors[0].message).toContain('"color" is not a valid CSS colour')
    expect(parseRoiGeoJson(withProps({ strokeColor: 'url(javascript:x)' }), BOUNDS).errors[0].message)
      .toContain('"strokeColor" is not a valid CSS colour')

    const ok = parseRoiGeoJson(withProps({ rgb: 'rgb(1, 2, 3)', color: '#abc', channel: 'nope' }), BOUNDS)
    expect(ok.errors).toEqual([])
    expect(ok.features[0].feature.properties.rgb).toBe('rgb(1, 2, 3)')
    expect(ok.features[0].feature.properties.color).toBe('#abc')
    expect(ok.features[0].feature.properties.strokeColor).toBe('rgba(1, 2, 3, 0)')
    expect(ok.features[0].feature.properties.channel).toBe('magenta') // unknown channel falls back
  })

  it('enforces size limits: payload bytes, ROI count and vertices per ring', () => {
    const tri = (i: number) => ({
      type: 'Feature',
      properties: { name: `r${i}` },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 5], [5, 5]]] },
    })
    const tooManyRois = JSON.stringify({ type: 'FeatureCollection', features: Array.from({ length: 201 }, (_, i) => tri(i)) })
    const many = parseRoiGeoJson(tooManyRois, BOUNDS)
    expect(many.features).toHaveLength(0)
    expect(many.errors[0].message).toContain('at most 200')

    const bigRing = Array.from({ length: 5001 }, (_, i) => [i % 50, Math.floor(i / 50) % 50])
    const tooManyVertices = JSON.stringify({ type: 'Polygon', coordinates: [bigRing] })
    expect(parseRoiGeoJson(tooManyVertices, BOUNDS).errors[0].message).toContain('limit 5000')

    const tooBig = ' '.repeat(MAX_GEOJSON_BYTES + 1) + '{}'
    expect(parseRoiGeoJson(tooBig, BOUNDS).errors[0].message).toContain('too large')
  })

  it('rejects names with control characters', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: { name: 'bad\u0000name' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 5], [5, 5]]] },
    })
    expect(parseRoiGeoJson(geojson, BOUNDS).errors[0].message).toContain('control characters')
  })

  it('rejects an unsupported root type', () => {
    const { features, errors } = parseRoiGeoJson(JSON.stringify({ type: 'LineString', coordinates: [] }), BOUNDS)
    expect(features).toHaveLength(0)
    expect(errors[0].message).toContain('Unsupported GeoJSON type')
  })
})
