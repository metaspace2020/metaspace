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

export interface RoiFeatureCollectionMeta {
  datasetId: string
  datasetName?: string
  imageWidth?: number
  imageHeight?: number
}

export function roiToFeature(roi: any): any {
  const coordinates = (roi.coordinates || []).map((c: any) => ({ x: c.x ?? c[0], y: c.y ?? c[1] }))
  const ring = coordinates.map((c: any) => [c.x, c.y])
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

export function roisToFeatureCollection(rois: any[], meta: RoiFeatureCollectionMeta): any {
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
