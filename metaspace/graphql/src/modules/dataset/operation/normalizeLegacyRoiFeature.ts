/**
 * Normalize a legacy ROI GeoJSON Feature (from the engine `dataset.roi` column).
 *
 * Legacy features store a malformed Polygon whose `geometry.coordinates` is a flat
 * ring `[[x, y], ...]` instead of an array of rings `[[[x, y], ...]]`. The authoritative
 * vertices live in `properties.coordinates` as `{x, y}` objects, so rebuild the geometry
 * from those (falling back to wrapping the flat ring) and emit a well-formed Polygon.
 * Other feature fields (notably `properties`, used by the annotation viewer) are kept.
 */
export default function normalizeLegacyRoiFeature(feature: any): any {
  const propCoords = feature?.properties?.coordinates
  let ring: number[][] | null = null
  if (Array.isArray(propCoords) && propCoords.length > 0) {
    ring = propCoords.map((c: any) => [c.x, c.y])
  } else {
    const gc = feature?.geometry?.coordinates
    if (Array.isArray(gc) && Array.isArray(gc[0])) {
      ring = typeof gc[0][0] === 'number' ? (gc as number[][]) : (gc[0] as number[][])
    }
  }
  return {
    ...feature,
    geometry: { type: 'Polygon', coordinates: ring ? [ring] : [] },
  }
}
