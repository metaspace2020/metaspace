import { defineComponent, PropType, ref } from 'vue'

export interface IonPreviewOverlay {
  id: string
  label: string
  color: string
  visible: boolean
  maskUrl: string | null
  geojson?: string | null
}

interface ParsedRing {
  points: string
}

/**
 * Parse a GeoJSON string (Polygon or MultiPolygon) into a flat list of rings,
 * each formatted as an SVG polygon `points` attribute.
 */
const parseGeoJsonRings = (geojson: string | null | undefined): ParsedRing[] => {
  if (!geojson) return []
  try {
    const obj = JSON.parse(geojson)
    const polygons: number[][][][] = []
    if (obj.type === 'Polygon') {
      polygons.push(obj.coordinates as number[][][])
    } else if (obj.type === 'MultiPolygon') {
      for (const poly of obj.coordinates as number[][][][]) {
        polygons.push(poly)
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
        const points = ring.map((pt) => `${pt[0]},${pt[1]}`).join(' ')
        rings.push({ points })
      }
    }
    return rings
  } catch {
    return []
  }
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
                  return (
                    <svg
                      key={o.id}
                      class="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox={viewBox}
                      preserveAspectRatio="none"
                      data-test-key={`overlay-${o.id}-svg`}
                    >
                      {rings.map((ring, i) => (
                        <polygon
                          key={i}
                          points={ring.points}
                          fill={o.color}
                          fillOpacity={0.3}
                          stroke={o.color}
                          strokeWidth={1}
                          vector-effect="non-scaling-stroke"
                        />
                      ))}
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
