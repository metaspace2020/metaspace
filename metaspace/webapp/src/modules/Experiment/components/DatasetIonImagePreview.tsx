import { defineComponent, PropType, ref } from 'vue'

export interface IonPreviewOverlay {
  id: string
  label: string
  color: string
  visible: boolean
  maskUrl: string | null
  geojson?: string | null
}

type Ring = [number, number][]

interface ParsedRing {
  /** Polygon vertices as an SVG `points` attribute, offset to pixel centers (for the fill). */
  points: string
  /** Original integer pixel-index vertices (for rasterizing the boundary). */
  ring: Ring
}

/**
 * Parse a GeoJSON string (Polygon or MultiPolygon) into a flat list of rings,
 * each formatted as an SVG polygon `points` attribute.
 *
 * ROI coordinates are pixel indices: a vertex `(x, y)` refers to the grid cell
 * whose top-left corner is `(x, y)`. The ion thumbnail draws that cell across
 * viewBox span `[x, x+1] × [y, y+1]`, so its center sits at `(x + 0.5, y + 0.5)`.
 * The annotation viewer draws the ROI path through those pixel centers
 * (see `ionImageRendering.ts`, `lineTo(x + 0.5, y + 0.5)`); we apply the same
 * half-pixel offset here so the overlay lines up cell-for-cell with the image
 * instead of being shifted up-left by half a cell (which left edges uncovered).
 */
const PIXEL_CENTER_OFFSET = 0.5

/**
 * Normalize a Polygon's `coordinates` to an array of rings (`number[][][]`).
 *
 * A valid GeoJSON Polygon nests as `[ring][point][x|y]`. Legacy ROIs (from the
 * engine `dataset.roi` column) are malformed: their `coordinates` is a single flat
 * ring `[point][x|y]`, missing the outer array. Detect that by checking whether the
 * innermost element is a number and, if so, wrap it as a single ring.
 */
const normalizePolygonRings = (coordinates: any): number[][][] => {
  if (Array.isArray(coordinates?.[0]) && typeof coordinates[0][0] === 'number') {
    return [coordinates as number[][]]
  }
  return coordinates as number[][][]
}

const parseGeoJsonRings = (geojson: string | null | undefined): ParsedRing[] => {
  if (!geojson) return []
  try {
    const obj = JSON.parse(geojson)
    const polygons: number[][][][] = []
    if (obj.type === 'Polygon') {
      polygons.push(normalizePolygonRings(obj.coordinates))
    } else if (obj.type === 'MultiPolygon') {
      for (const poly of obj.coordinates as number[][][][]) {
        polygons.push(normalizePolygonRings(poly))
      }
    } else if (obj.type === 'Feature' && obj.geometry) {
      return parseGeoJsonRings(JSON.stringify(obj.geometry))
    } else if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
      return obj.features.flatMap((f: any) => parseGeoJsonRings(JSON.stringify(f.geometry)))
    } else {
      return []
    }
    const rings: ParsedRing[] = []
    for (const poly of polygons) {
      for (const ring of poly) {
        const points = ring.map((pt) => `${pt[0] + PIXEL_CENTER_OFFSET},${pt[1] + PIXEL_CENTER_OFFSET}`).join(' ')
        rings.push({ points, ring: ring.map((pt) => [pt[0], pt[1]]) as Ring })
      }
    }
    return rings
  } catch {
    return []
  }
}

/**
 * Rasterize one polygon edge into grid cells with Bresenham's line algorithm,
 * adding each `"x,y"` cell to `cells`.
 */
const rasterizeEdge = (a: [number, number], b: [number, number], cells: Set<string>): void => {
  let x0 = Math.round(a[0])
  let y0 = Math.round(a[1])
  const x1 = Math.round(b[0])
  const y1 = Math.round(b[1])
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  // eslint-disable-next-line no-constant-condition
  while (true) {
    cells.add(`${x0},${y0}`)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
}

const BORDER_WIDTH_CELLS = 1

const dilateCells = (cells: Set<string>, passes: number): Set<string> => {
  let current = cells
  for (let p = 0; p < passes; p++) {
    const next = new Set(current)
    for (const key of current) {
      const [x, y] = key.split(',').map(Number)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          next.add(`${x + dx},${y + dy}`)
        }
      }
    }
    current = next
  }
  return current
}

/**
 * Build an SVG path that draws the ROI border as the pixel cells along its drawn
 * edges — exactly mirroring the annotation viewer's pixel brush
 * (`ionImageRendering.ts`, which rasterizes each segment between consecutive
 * vertices and skips the closing edge).
 *
 * Tracing the *drawn edges* (rather than the boundary of the selected-pixel region)
 * is what keeps the border faithful to what the user drew: it follows the polygon's
 * straight sides instead of jagged in/out notches where a hand-drawn ring is
 * malformed, and — because the closing edge is skipped — it shows no diagonal
 * "tail". Consecutive edges share endpoint cells, so the border reads continuous.
 * The traced cells are then dilated to `BORDER_WIDTH_CELLS` thickness.
 *
 * Pixel `(x, y)` occupies viewBox span `[x, x+1] × [y, y+1]` (matching the ion
 * thumbnail), so each border cell is emitted as a unit rect at `(x, y)`.
 */
const rasterizeBorder = (rings: ParsedRing[]): string => {
  let cells = new Set<string>()
  for (const { ring } of rings) {
    if (ring.length < 2) continue
    for (let i = 1; i < ring.length; i++) {
      rasterizeEdge(ring[i - 1], ring[i], cells)
    }
  }
  if (cells.size === 0) return ''
  if (BORDER_WIDTH_CELLS > 1) cells = dilateCells(cells, BORDER_WIDTH_CELLS - 1)

  let d = ''
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number)
    d += `M${x} ${y}h1v1h-1z`
  }
  return d
}

export default defineComponent({
  name: 'DatasetIonImagePreview',
  props: {
    ionImageUrl: { type: String as PropType<string | null>, default: null },
    opticalImageUrl: { type: String as PropType<string | null>, default: null },
    imageWidth: { type: Number as PropType<number | null>, default: null },
    imageHeight: { type: Number as PropType<number | null>, default: null },
    overlays: { type: Array as PropType<IonPreviewOverlay[]>, default: () => [] },
    shown: { type: Boolean, default: true },
    hideIonImage: { type: Boolean, default: false },
  },
  setup(props) {
    const naturalWidth = ref<number>(0)
    const naturalHeight = ref<number>(0)

    const onIonImageLoad = (e: Event): void => {
      const img = e.target as HTMLImageElement
      naturalWidth.value = img.naturalWidth
      naturalHeight.value = img.naturalHeight
    }

    return () => {
      if (!props.shown) return <div class="hidden" />
      const visibleOverlays = props.overlays.filter((o) => o.visible)
      // Prefer the original ion-image acquisition dimensions for the SVG viewBox —
      // ROI geojson coords are in original-image pixel space, not the downscaled
      // thumbnail's space. Fall back to the loaded image's natural dims.
      const vbW = props.imageWidth ?? naturalWidth.value
      const vbH = props.imageHeight ?? naturalHeight.value
      const viewBox = vbW > 0 && vbH > 0 ? `0 0 ${vbW} ${vbH}` : '0 0 100 100'
      return (
        <div class="relative p-2 flex justify-center">
          <div class="relative w-full" style={{ maxHeight: '320px' }}>
            <div class="relative mx-auto" style={{ maxHeight: '300px', maxWidth: '100%' }}>
              {props.opticalImageUrl && (
                <img
                  src={props.opticalImageUrl}
                  class="absolute inset-0 w-full h-full object-contain opacity-60 pointer-events-none"
                  style={{ imageRendering: 'pixelated' }}
                  data-test-key="ion-image-optical"
                />
              )}
              {props.ionImageUrl && (
                <img
                  src={props.ionImageUrl}
                  class="relative block w-full object-contain"
                  style={{
                    maxHeight: '300px',
                    height: 'auto',
                    imageRendering: 'pixelated',
                    visibility: props.hideIonImage ? 'hidden' : 'visible',
                  }}
                  onLoad={onIonImageLoad}
                  data-test-key="ion-image-tic"
                />
              )}
              {visibleOverlays.map((o) => {
                const rings = parseGeoJsonRings(o.geojson)
                if (rings.length > 0) {
                  const borderPath = rasterizeBorder(rings)
                  return (
                    <svg
                      key={o.id}
                      class="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox={viewBox}
                      preserveAspectRatio="xMidYMid meet"
                      data-test-key={`overlay-${o.id}-svg`}
                    >
                      {rings.map((ring, i) => (
                        <polygon key={i} points={ring.points} fill={o.color} fill-opacity={0.8} stroke="none" />
                      ))}
                      {borderPath && (
                        <path d={borderPath} fill={o.color} stroke="none" data-test-key={`overlay-${o.id}-border`} />
                      )}
                    </svg>
                  )
                }
                if (o.maskUrl) {
                  return (
                    <img
                      key={o.id}
                      src={o.maskUrl}
                      class="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      style={{ opacity: 0.5 }}
                      data-test-key={`overlay-${o.id}`}
                    />
                  )
                }
                return null
              })}
            </div>
          </div>
        </div>
      )
    }
  },
})
