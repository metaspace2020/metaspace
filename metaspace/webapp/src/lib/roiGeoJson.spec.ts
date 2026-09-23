import { describe, it, expect } from 'vitest'
import { roiToFeature, roisToFeatureCollection } from './roiGeoJson'

const roi = {
  name: 'ROI 1',
  channel: 'magenta',
  rgb: 'rgb(255, 0, 255)',
  color: 'rgba(255, 0, 255, 0.4)',
  strokeColor: 'rgba(255, 0, 255, 0)',
  visible: true,
  allVisible: true,
  coordinates: [
    { x: 1, y: 1 },
    { x: 1, y: 10 },
    { x: 10, y: 10 },
  ],
}

describe('roiToFeature', () => {
  it('closes the geometry ring but keeps properties.coordinates open', () => {
    const feature = roiToFeature(roi)
    expect(feature.properties.coordinates).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 10 },
      { x: 10, y: 10 },
    ])
    expect(feature.geometry.coordinates[0]).toEqual([
      [1, 1],
      [1, 10],
      [10, 10],
      [1, 1],
    ])
  })

  it('does not double-close an already-closed ring', () => {
    const closedRoi = { ...roi, coordinates: [...roi.coordinates, { x: 1, y: 1 }] }
    const feature = roiToFeature(closedRoi)
    expect(feature.geometry.coordinates[0]).toEqual([
      [1, 1],
      [1, 10],
      [10, 10],
      [1, 1],
    ])
  })
})

describe('roisToFeatureCollection', () => {
  it('wraps ROIs into a FeatureCollection with metadata, skipping in-progress/removed ROIs', () => {
    const fc = roisToFeatureCollection(
      [roi, { ...roi, name: 'ROI 2', isDrawing: true }, { ...roi, name: 'ROI 3', removed: true }],
      { datasetId: 'ds1', datasetName: 'My dataset', imageWidth: 100, imageHeight: 100 }
    )
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.metadata).toMatchObject({
      datasetId: 'ds1',
      datasetName: 'My dataset',
      imageWidth: 100,
      imageHeight: 100,
    })
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].properties.name).toBe('ROI 1')
  })
})
