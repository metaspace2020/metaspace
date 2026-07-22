/**
 * Build per-segment overlay masks (dataURL PNGs) from a segmentation's LABEL_MAP NPY file.
 *
 * Each output PNG has the same dimensions as the original ion-image acquisition grid:
 * pixels belonging to the segment are painted with the chosen color (opaque), all
 * other pixels remain transparent. The resulting dataURL is intended to be rendered
 * by `DatasetIonImagePreview` as an absolute-positioned `<img>` overlay.
 */

export interface SegmentationLike {
  id: string
  segmentIndex: number
}

export interface DecodedLabelMap {
  width: number
  height: number
  data: Int32Array | Int16Array | Uint8Array
}

/** Parse an NPY arrayBuffer into a 2D label map. Mirrors SegmentationVisualization's parser. */
export const decodeLabelMapNpy = (buffer: ArrayBuffer): DecodedLabelMap => {
  const view = new DataView(buffer)
  const magic = new Uint8Array(buffer, 0, 6)
  const magicStr = String.fromCharCode(...magic)
  if (magicStr !== '\x93NUMPY') throw new Error('Invalid NPY file format')

  const major = view.getUint8(6)
  let headerLength: number
  let dataOffset: number
  if (major === 1) {
    headerLength = view.getUint16(8, true)
    dataOffset = 10 + headerLength
  } else if (major === 2) {
    headerLength = view.getUint32(8, true)
    dataOffset = 12 + headerLength
  } else {
    throw new Error(`Unsupported NPY version: ${major}`)
  }

  const headerBytes = new Uint8Array(buffer, major === 1 ? 10 : 12, headerLength)
  const headerStr = String.fromCharCode(...headerBytes).trim()
  const shapeMatch = headerStr.match(/'shape':\s*\((\d+),\s*(\d+)\)/)
  const dtypeMatch = headerStr.match(/'descr':\s*'([^']+)'/)
  if (!shapeMatch || !dtypeMatch) throw new Error('Could not parse NPY header')

  const height = parseInt(shapeMatch[1], 10)
  const width = parseInt(shapeMatch[2], 10)
  const dtype = dtypeMatch[1]
  const count = width * height

  if (dtype.includes('i4')) {
    const out = new Int32Array(count)
    const dv = new DataView(buffer, dataOffset)
    for (let i = 0; i < count; i++) out[i] = dv.getInt32(i * 4, true)
    return { width, height, data: out }
  }
  if (dtype.includes('i2')) {
    const out = new Int16Array(count)
    const dv = new DataView(buffer, dataOffset)
    for (let i = 0; i < count; i++) out[i] = dv.getInt16(i * 2, true)
    return { width, height, data: out }
  }
  if (dtype.includes('i1') || dtype.includes('u1')) {
    return { width, height, data: new Uint8Array(buffer, dataOffset, count) }
  }
  throw new Error(`Unsupported NPY dtype: ${dtype}`)
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const m = hex.replace('#', '')
  const v =
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m
  return {
    r: parseInt(v.slice(0, 2), 16) || 0,
    g: parseInt(v.slice(2, 4), 16) || 0,
    b: parseInt(v.slice(4, 6), 16) || 0,
  }
}

const createCanvas = (width: number, height: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: any } => {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    return { canvas, ctx: canvas.getContext('2d')! }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d')! }
}

/** Build a single-segment mask PNG dataURL. */
const buildSegmentMaskDataUrl = (labelMap: DecodedLabelMap, segmentIndex: number, color: string): string => {
  const { width, height, data } = labelMap
  const { canvas, ctx } = createCanvas(width, height)
  const imageData = ctx.createImageData(width, height)
  const { r, g, b } = hexToRgb(color)
  for (let i = 0; i < data.length; i++) {
    if (data[i] === segmentIndex) {
      const j = i * 4
      imageData.data[j] = r
      imageData.data[j + 1] = g
      imageData.data[j + 2] = b
      imageData.data[j + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)
  // OffscreenCanvas lacks toDataURL; in that case copy to a regular canvas.
  if ('toDataURL' in canvas) return (canvas as HTMLCanvasElement).toDataURL('image/png')
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  out.getContext('2d')!.drawImage(canvas as unknown as CanvasImageSource, 0, 0)
  return out.toDataURL('image/png')
}

export interface BuildSegmentationMasksInput {
  labelMapUrl: string
  segmentations: SegmentationLike[]
  colorBySegmentationId: Record<string, string>
  fetchImpl?: typeof fetch
}

/**
 * Fetch the LABEL_MAP NPY and produce a `Record<segmentationId, dataURL>` of mask PNGs,
 * one per segmentation entry. Segmentations without a color or whose segmentIndex is
 * outside the label map's value range are silently skipped.
 */
export const buildSegmentationMasks = async (input: BuildSegmentationMasksInput): Promise<Record<string, string>> => {
  const { labelMapUrl, segmentations, colorBySegmentationId } = input
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(labelMapUrl)
  if (!response.ok) throw new Error(`Failed to fetch LABEL_MAP: ${response.statusText}`)
  const buffer = await response.arrayBuffer()
  const labelMap = decodeLabelMapNpy(buffer)
  const out: Record<string, string> = {}
  for (const seg of segmentations) {
    const color = colorBySegmentationId[seg.id]
    if (!color) continue
    out[seg.id] = buildSegmentMaskDataUrl(labelMap, seg.segmentIndex, color)
  }
  return out
}
