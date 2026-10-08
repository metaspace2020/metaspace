/**
 * Parse and validate a user-supplied GeoJSON payload into ROI-ready Features.
 *
 * Accepts a root `FeatureCollection`, a bare `Feature`, or a bare `Geometry`
 * (`Polygon`/`MultiPolygon`). Every output feature carries both
 * `properties.coordinates` (an `{x, y}` ring) and a closed `geometry.coordinates[0]`
 * ring, matching the shape written by the webapp ROI editor -- some downstream
 * consumers read one, some the other (see RoiSettings.tsx, diff_roi_manager.py,
 * experiment_masks.py).
 *
 * Coordinates are ion-image pixel space (x = column, y = row), not a geographic CRS.
 * A vertex outside the target dataset's ion-image grid, or a declared
 * `metadata.imageWidth`/`imageHeight` that doesn't match it, is a fatal error --
 * imported ROIs must line up with the target dataset's pixels; there's no rescaling.
 */

export interface RoiIssue {
  featureIndex: number | null
  message: string
}

export interface ParsedRoiFeature {
  name: string
  feature: any
}

export interface RoiParseResult {
  features: ParsedRoiFeature[]
  errors: RoiIssue[]
  warnings: RoiIssue[]
}

export interface Bounds {
  width: number
  height: number
}

/** Extracts the ion-image pixel grid size from an ES dataset (`esDatasetByID` result). */
export function getDatasetImageBounds(esDataset: any): Bounds | null {
  const grid = esDataset?._source?.ds_acq_geometry?.acquisition_grid
  if (!grid || typeof grid.count_x !== 'number' || typeof grid.count_y !== 'number') {
    return null
  }
  return { width: grid.count_x, height: grid.count_y }
}

const CHANNELS: Record<string, string> = {
  magenta: 'rgb(255, 0, 255)',
  green: 'rgb(0, 255, 0)',
  blue: 'rgb(0, 0, 255)',
  red: 'rgb(255, 0, 0)',
  yellow: 'rgb(255, 255, 0)',
  cyan: 'rgb(0, 255, 255)',
  orange: 'rgb(255, 128, 0)',
  violet: 'rgb(128, 0, 255)',
  white: 'rgb(255, 255, 255)',
}
const CHANNEL_NAMES = Object.keys(CHANNELS)

export const MAX_ROI_NAME_LENGTH = 200
/** Upper bounds on what one import may contain; anything larger is rejected up front. */
export const MAX_GEOJSON_BYTES = 15000000
export const MAX_ROI_COUNT = 200
export const MAX_RING_VERTICES = 5000

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/

// `rgb(...)`/`rgba(...)`/`hsl(...)`/`hsla(...)` or a hex colour. These values end up in CSS
// (RoiSettings.tsx renders them as inline styles), so only plain colour literals are accepted.
const CSS_COLOR_RE = /^(?:(?:rgb|rgba|hsl|hsla)\([\d\s.,%]{1,40}\)|#[0-9a-f]{3,8})$/i

function isCssColor(value: any): value is string {
  return typeof value === 'string' && CSS_COLOR_RE.test(value.trim())
}

export default function parseRoiGeoJson(raw: string, bounds: Bounds): RoiParseResult {
  const errors: RoiIssue[] = []
  const warnings: RoiIssue[] = []
  const features: ParsedRoiFeature[] = []

  if (typeof raw !== 'string' || raw.length > MAX_GEOJSON_BYTES) {
    errors.push({
      featureIndex: null,
      message: `GeoJSON is too large (limit ${Math.round(MAX_GEOJSON_BYTES / 1000000)} MB)`,
    })
    return { features, errors, warnings }
  }

  let root: any
  try {
    root = JSON.parse(raw)
  } catch (e) {
    errors.push({ featureIndex: null, message: 'File is not valid JSON' })
    return { features, errors, warnings }
  }

  if (root == null || typeof root !== 'object') {
    errors.push({ featureIndex: null, message: 'GeoJSON root must be an object' })
    return { features, errors, warnings }
  }

  const metaWidth = root.metadata?.imageWidth
  const metaHeight = root.metadata?.imageHeight
  if (
    (typeof metaWidth === 'number' && metaWidth !== bounds.width)
    || (typeof metaHeight === 'number' && metaHeight !== bounds.height)
  ) {
    errors.push({
      featureIndex: null,
      message: `GeoJSON was exported for a ${metaWidth}x${metaHeight} image, but this dataset's `
        + `ion image grid is ${bounds.width}x${bounds.height}`,
    })
    return { features, errors, warnings }
  }

  const rawFeatures = extractRawFeatures(root, errors)
  let outputIndex = 0

  rawFeatures.forEach(({ feature, index }) => {
    const rings = extractPolygonRings(feature, index, errors, warnings)
    const multi = rings.length > 1

    rings.forEach((ring, ringIdx) => {
      const provisionalName = deriveName(feature, multi ? ringIdx : -1, outputIndex, index, errors)
      if (provisionalName == null) {
        return
      }
      const props = feature.properties != null && typeof feature.properties === 'object' ? feature.properties : {}
      const colorError = validateColorProps(props, index, provisionalName)
      if (colorError) {
        errors.push(colorError)
        return
      }
      const cleaned = sanitizeRing(ring, index, provisionalName, errors)
      if (cleaned == null) {
        return
      }

      const closedRing = closeRing(cleaned)
      const outOfBounds = closedRing.find(([x, y]) => x < 0 || y < 0 || x > bounds.width || y > bounds.height)
      if (outOfBounds) {
        errors.push({
          featureIndex: index,
          message: `Feature ${index} ("${provisionalName}"): vertex (${outOfBounds[0]}, ${outOfBounds[1]}) is `
            + `outside the dataset's ${bounds.width}x${bounds.height} image grid`,
        })
        return
      }

      const openCoords = closedRing.slice(0, -1).map(([x, y]) => ({ x, y }))
      const channelName = typeof props.channel === 'string' && CHANNEL_NAMES.includes(props.channel)
        ? props.channel
        : CHANNEL_NAMES[outputIndex % CHANNEL_NAMES.length]
      const rgb: string = isCssColor(props.rgb) ? props.rgb : CHANNELS[channelName]
      // Fill/stroke are derived by rewriting `rgb(...)` into `rgba(...)`; that only works for an actual
      // rgb() literal, so for hex/hsl/rgba values derive from the channel colour instead.
      const derivationBase = /^rgb\(/i.test(rgb.trim()) ? rgb.trim() : CHANNELS[channelName]
      const color: string = isCssColor(props.color)
        ? props.color
        : derivationBase.replace('rgb', 'rgba').replace(')', ', 0.4)')
      const strokeColor: string = isCssColor(props.strokeColor)
        ? props.strokeColor
        : derivationBase.replace('rgb', 'rgba').replace(')', ', 0)')

      features.push({
        name: provisionalName,
        feature: {
          type: 'Feature',
          properties: {
            name: provisionalName,
            coordinates: openCoords,
            channel: channelName,
            rgb,
            color,
            strokeColor,
            visible: props.visible !== undefined ? !!props.visible : true,
            allVisible: props.allVisible !== undefined ? !!props.allVisible : true,
            stroke: rgb,
            'stroke-width': 1,
            'stroke-opacity': 0,
            fill: rgb,
            'fill-opacity': 0.4,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [closedRing],
          },
        },
      })
      outputIndex += 1
    })
  })

  if (features.length > MAX_ROI_COUNT) {
    errors.push({
      featureIndex: null,
      message: `File contains ${features.length} ROIs; at most ${MAX_ROI_COUNT} can be imported at once`,
    })
    features.length = 0
  }

  return { features, errors, warnings }
}

function extractRawFeatures(root: any, errors: RoiIssue[]): { feature: any; index: number }[] {
  if (root.type === 'FeatureCollection') {
    const feats = Array.isArray(root.features) ? root.features : []
    if (feats.length === 0) {
      errors.push({ featureIndex: null, message: 'FeatureCollection has no features' })
    }
    // Cheap early exit so an oversized collection is not fully parsed before being rejected
    // (the same limit is re-checked after MultiPolygons are split).
    if (feats.length > MAX_ROI_COUNT) {
      errors.push({
        featureIndex: null,
        message: `File contains ${feats.length} features; at most ${MAX_ROI_COUNT} ROIs can be imported at once`,
      })
      return []
    }
    return feats.map((feature: any, index: number) => ({ feature, index }))
  }
  if (root.type === 'Feature') {
    return [{ feature: root, index: 0 }]
  }
  if (root.type === 'Polygon' || root.type === 'MultiPolygon') {
    return [{ feature: { type: 'Feature', properties: {}, geometry: root }, index: 0 }]
  }
  errors.push({ featureIndex: null, message: `Unsupported GeoJSON type "${root.type}"` })
  return []
}

/** Returns one outer ring per polygon (holes/interior rings are dropped with a warning). */
function extractPolygonRings(feature: any, index: number, errors: RoiIssue[], warnings: RoiIssue[]): any[][] {
  // Our own internal shape: properties.coordinates ({x, y} objects) is authoritative.
  // A missing/null axis means 0: the old ROI editor serialised vertices with `coord.y || coord[1]`,
  // so an edge vertex (y == 0) was persisted as `{x: N}`. The engine reads these the same way
  // (experiment_masks.py `_vertex`), and the webapp export of such a legacy ROI reproduces the shape.
  const propCoords = feature?.properties?.coordinates
  if (
    Array.isArray(propCoords)
    && propCoords.length > 0
    && propCoords.every((c: any) => c != null && typeof c === 'object' && !Array.isArray(c))
  ) {
    return [propCoords.map((c: any) => [c.x == null ? 0 : c.x, c.y == null ? 0 : c.y])]
  }

  const geometry = feature?.geometry
  if (!geometry || typeof geometry !== 'object') {
    errors.push({ featureIndex: index, message: `Feature ${index} has no geometry` })
    return []
  }

  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates
    if (!Array.isArray(coords) || coords.length === 0) {
      errors.push({ featureIndex: index, message: `Feature ${index}: empty Polygon geometry` })
      return []
    }
    // Legacy malformed shape: a flat ring (coordinates[0] is a number, not a point array).
    const rings: any[][] = typeof coords[0]?.[0] === 'number' ? [coords] : coords
    if (rings.length > 1) {
      warnings.push({
        featureIndex: index,
        message: `Feature ${index}: interior ring(s) ignored (holes are not supported)`,
      })
    }
    return [rings[0]]
  }

  if (geometry.type === 'MultiPolygon') {
    const polys = Array.isArray(geometry.coordinates) ? geometry.coordinates : []
    if (polys.length > 1) {
      warnings.push({ featureIndex: index, message: `Feature ${index}: MultiPolygon split into ${polys.length} ROIs` })
    }
    return polys.map((rings: any, i: number) => {
      if (!Array.isArray(rings) || rings.length === 0) {
        errors.push({ featureIndex: index, message: `Feature ${index}, polygon ${i + 1}: empty or malformed polygon` })
        return null
      }
      if (rings.length > 1) {
        warnings.push({
          featureIndex: index,
          message: `Feature ${index}, polygon ${i + 1}: interior ring(s) ignored (holes are not supported)`,
        })
      }
      return rings[0]
    }).filter((ring: any) => ring != null)
  }

  errors.push({ featureIndex: index, message: `Feature ${index}: unsupported geometry type "${geometry.type}"` })
  return []
}

function sanitizeRing(ring: any, index: number, name: string, errors: RoiIssue[]): number[][] | null {
  if (!Array.isArray(ring)) {
    errors.push({ featureIndex: index, message: `Feature ${index} ("${name}"): polygon ring is not an array` })
    return null
  }
  if (ring.length > MAX_RING_VERTICES) {
    errors.push({
      featureIndex: index,
      message: `Feature ${index} ("${name}"): polygon has ${ring.length} vertices (limit ${MAX_RING_VERTICES})`,
    })
    return null
  }
  const points = ring.map((pt: any) => (Array.isArray(pt) ? [Number(pt[0]), Number(pt[1])] : null))
  if (points.some((pt) => pt === null || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1]))) {
    errors.push({ featureIndex: index, message: `Feature ${index} ("${name}"): polygon has a non-numeric vertex` })
    return null
  }
  let cleaned = points as number[][]
  // Drop an already-closed trailing duplicate of the first vertex; we close explicitly later.
  if (
    cleaned.length > 1
    && cleaned[0][0] === cleaned[cleaned.length - 1][0]
    && cleaned[0][1] === cleaned[cleaned.length - 1][1]
  ) {
    cleaned = cleaned.slice(0, -1)
  }
  if (cleaned.length < 3) {
    errors.push({ featureIndex: index, message: `Feature ${index} ("${name}"): polygon needs at least 3 vertices` })
    return null
  }
  return cleaned
}

function closeRing(ring: number[][]): number[][] {
  const [fx, fy] = ring[0]
  const [lx, ly] = ring[ring.length - 1]
  if (fx === lx && fy === ly) {
    return ring
  }
  return [...ring, [fx, fy]]
}

/**
 * Resolves the ROI name for one output ring. A missing/empty `properties.name` gets a default;
 * anything that is not a reasonably short string is a fatal error, because the name is stored in a
 * text column and rendered verbatim by the ROI panel.
 */
function deriveName(
  feature: any,
  ringIdx: number,
  outputIndex: number,
  index: number,
  errors: RoiIssue[]
): string | null {
  const rawName = feature?.properties?.name
  let base: string
  if (rawName == null || rawName === '') {
    base = `Imported ROI ${outputIndex + 1}`
  } else if (typeof rawName !== 'string' || rawName.trim() === '') {
    errors.push({ featureIndex: index, message: `Feature ${index}: "name" must be a non-empty string` })
    return null
  } else if (CONTROL_CHARS_RE.test(rawName)) {
    errors.push({ featureIndex: index, message: `Feature ${index}: "name" contains control characters` })
    return null
  } else if (rawName.length > MAX_ROI_NAME_LENGTH) {
    errors.push({
      featureIndex: index,
      message: `Feature ${index}: "name" is longer than ${MAX_ROI_NAME_LENGTH} characters`,
    })
    return null
  } else {
    base = rawName.trim()
  }
  return ringIdx >= 0 ? `${base} (${ringIdx + 1})` : base
}

/** Colour properties are optional, but when present they must be CSS colour literals. */
function validateColorProps(props: any, index: number, name: string): RoiIssue | null {
  for (const key of ['rgb', 'color', 'strokeColor']) {
    const value = props[key]
    if (value != null && value !== '' && !isCssColor(value)) {
      return {
        featureIndex: index,
        message: `Feature ${index} ("${name}"): "${key}" is not a valid CSS colour (e.g. "rgb(255, 0, 0)")`,
      }
    }
  }
  return null
}
