/**
 * Builds the GeoJSON Feature/FeatureCollection shape used to export ROIs, and the shape
 * used to save one to the server (RoiSettings.tsx's handleSave).
 *
 * Geometry rings are closed (RFC 7946) for export; `properties.coordinates` stays as the
 * open `{x, y}` ring, matching the shape the rest of the app already reads (diff_roi_manager.py,
 * experiment_masks.py, RoiSettings.tsx itself). Coordinates are ion-image pixel space
 * (x = column, y = row), not a geographic CRS -- the same convention used everywhere else
 * ROIs are stored and read.
 */

export interface RoiVertex {
  x: number
  y: number
}

/** The subset of a ROI-panel entry that the GeoJSON helpers read. */
export interface PanelRoiLike {
  name: string
  channel: string
  rgb: string
  color: string
  strokeColor: string
  visible: boolean
  allVisible: boolean
  /** `{x, y}` objects normally; legacy rows may hold `[x, y]` pairs or drop a 0-valued axis. */
  coordinates: Array<Partial<RoiVertex> | number[]>
  isDrawing?: boolean
  removed?: boolean
}

export interface RoiFeatureProperties {
  name: string
  coordinates: RoiVertex[]
  channel: string
  rgb: string
  color: string
  strokeColor: string
  visible: boolean
  allVisible: boolean
  stroke: string
  'stroke-width': number
  'stroke-opacity': number
  fill: string
  'fill-opacity': number
}

export interface RoiFeature {
  type: 'Feature'
  properties: RoiFeatureProperties
  geometry: { type: 'Polygon'; coordinates: number[][][] }
}

export interface RoiFeatureCollectionMeta {
  datasetId: string
  datasetName?: string
  imageWidth?: number
  imageHeight?: number
}

export interface RoiFeatureCollection {
  type: 'FeatureCollection'
  metadata: RoiFeatureCollectionMeta & { exportedAt: string }
  features: RoiFeature[]
}

/**
 * Reads a vertex that may be `{x, y}`, `[x, y]`, or a legacy `{x}` with the 0-valued axis dropped
 * (the old editor serialised with `coord.y || coord[1]`); a missing axis is 0, as the engine assumes.
 */
export function toVertex(c: Partial<RoiVertex> | number[]): RoiVertex {
  if (Array.isArray(c)) {
    return { x: c[0] ?? 0, y: c[1] ?? 0 }
  }
  return { x: c.x ?? 0, y: c.y ?? 0 }
}

export function roiToFeature(roi: PanelRoiLike): RoiFeature {
  const coordinates = (roi.coordinates || []).map(toVertex)
  const ring = coordinates.map((c) => [c.x, c.y])
  const isClosed = ring.length > 0 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  const closedRing = ring.length > 0 && !isClosed ? [...ring, ring[0]] : ring

  return {
    type: 'Feature',
    properties: {
      name: roi.name,
      coordinates,
      channel: roi.channel,
      rgb: roi.rgb,
      color: roi.color,
      strokeColor: roi.strokeColor,
      visible: roi.visible,
      allVisible: roi.allVisible,
      stroke: roi.rgb,
      'stroke-width': 1,
      'stroke-opacity': 0,
      fill: roi.rgb,
      'fill-opacity': 0.4,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [closedRing],
    },
  }
}

export function roisToFeatureCollection(rois: PanelRoiLike[], meta: RoiFeatureCollectionMeta): RoiFeatureCollection {
  const features = (rois || [])
    .filter((roi) => !roi.isDrawing && !roi.removed && (roi.coordinates || []).length > 0)
    .map(roiToFeature)

  return {
    type: 'FeatureCollection',
    metadata: {
      datasetId: meta.datasetId,
      ...(meta.datasetName ? { datasetName: meta.datasetName } : {}),
      ...(meta.imageWidth != null ? { imageWidth: meta.imageWidth } : {}),
      ...(meta.imageHeight != null ? { imageHeight: meta.imageHeight } : {}),
      exportedAt: new Date().toISOString(),
    },
    features,
  }
}
