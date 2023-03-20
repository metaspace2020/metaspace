import { decode, Image, toRGBA8 } from 'upng-js'
import { quantile } from 'simple-statistics'
import { range } from 'lodash-es'
import { DEFAULT_SCALE_TYPE } from './constants'
// @ts-ignore
import PxBrush from 'px-brush'

export interface IonImage {
  intensityValues: Float32Array;
  clippedValues: Uint8ClampedArray; // Intensity values scaled into 0-255
  mask: Uint8ClampedArray; // 0 = empty, 255 = filled, no other values
  width: number;
  height: number;
  minIntensity: number;
  maxIntensity: number;
  clippedMinIntensity: number;
  clippedMaxIntensity: number;
  scaledMinIntensity: number;
  scaledMaxIntensity: number;
  userMinIntensity: number;
  userMaxIntensity: number;
  // scaleBarValues - Quantization of linear intensity values, used for showing the distribution of colors on the scale bar
  // Always length 256
  scaleBarValues: Uint8ClampedArray;
  lowQuantile: number;
  highQuantile: number;
}

export interface Normalization {
  data: Float32Array | null
  shape: [number, number] | null,
  metadata: any,
  type: string | null,
  showFullTIC: boolean | null,
  error: boolean,
}

export type ColorMap = readonly number[][]

export type IonImageLayer = { ionImage: IonImage, colorMap: ColorMap }

export type ScaleType = 'linear' | 'linear-full' | 'log' | 'log-full' | 'hist' | 'test';
export type ScaleMode = 'linear' | 'log' | 'hist';

const SCALES: Record<ScaleType, [ScaleMode, number, number]> = {
  linear: ['linear', 0, 0.99],
  'linear-full': ['linear', 0, 1],
  log: ['log', 0.01, 0.99],
  'log-full': ['log', 0, 1],
  hist: ['hist', 0, 1],
  test: ['linear', 0, 0.5], // For unit tests, because it's easier to make test data for 50% threshold than 99%
}

const applyImageData = (canvas: HTMLCanvasElement, imageBytes: Uint8ClampedArray, width: number, height: number) => {
  if (imageBytes.length !== width * height * 4) {
    throw new Error('imageBytes must be in RGBA format')
  }
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  let imageData: ImageData
  try {
    imageData = new ImageData(imageBytes, width, height)
  } catch (ex) {
    // IE11 doesn't support `new ImageData`, so it gets the slow path
    imageData = ctx.createImageData(width, height)
    imageData.data.set(imageBytes)
  }
  ctx.putImageData(imageData, 0, 0)
}

const createDataUrl = (imageBytes: Uint8ClampedArray, width: number, height: number) => {
  const canvas = document.createElement('canvas')
  applyImageData(canvas, imageBytes, width, height)
  return canvas.toDataURL()
}

const getNormalizationIntensityAndMask = (normalizationData: Normalization) => {
  const intensityValues = normalizationData.data!
  const mask = new Uint8ClampedArray(intensityValues.length)
  for (let i = 0; i < intensityValues.length; i++) {
    mask[i] = Number.isNaN(intensityValues[i]) ? 0 : 255
  }
  const [width, height] = normalizationData.shape!

  return { intensityValues, mask, width, height }
}

const extractIntensityAndMask = (png: Image, min: number, max: number, normalizationData?: Normalization) => {
  const { width, height, depth, ctype } = png
  const hasAlpha = ctype === 4 || ctype === 6
  const isRGB = ctype === 6
  const bytesPerComponent = depth <= 8 ? 1 : 2
  const numPixels = (width * height)
  const numComponents = (ctype & 2 ? 3 : 1) + (hasAlpha ? 1 : 0)
  const rangeVal = Number(max - min) / (bytesPerComponent === 1 ? 255 : 65535)
  const baseVal = Number(min)
  // NOTE: pngDataBuffer usually has some trailing padding bytes. TypedArrays should have explicit sizes specified to
  // prevent over-reading // if hasAlpha, 16bit and not grayscale uses toRGBA to translate frames
  const pngDataBuffer = (hasAlpha && bytesPerComponent > 1 && !isRGB) ? toRGBA8(png)[0]
    : (png.data as any as Uint8Array).buffer // The typings are wrong
  const TIC_MULTIPLIER = 1000000

  // NOTE: This function is a bit verbose. It's intentionally structured this way so that the JS engine can
  // statically determine the types of all variables involved in copying, and hopefully generate fast machine code.
  const intensityValues = new Float32Array(numPixels)
  const mask = new Uint8ClampedArray(numPixels)
  const dataView = new DataView(pngDataBuffer, 0, numPixels * numComponents * bytesPerComponent)
  if (bytesPerComponent === 1) {
    for (let i = 0; i < numPixels; i++) {
      const byteOffset = i * numComponents * bytesPerComponent
      let intensity = dataView.getUint8(byteOffset) * rangeVal + baseVal
      // apply normalization
      if (
        normalizationData && normalizationData.data
        && normalizationData.data.length === numPixels
        && normalizationData.data[i] && !isNaN(normalizationData.data[i])) {
        intensity = (intensity / normalizationData.data[i]) * TIC_MULTIPLIER
      } else if (
        normalizationData && normalizationData.data
        && normalizationData.data.length === numPixels) {
        intensity = 0
      }

      intensityValues[i] = intensity
    }
    if (hasAlpha) {
      const alphaOffset = numComponents - 1
      for (let i = 0; i < numPixels; i++) {
        const byteOffset = i * numComponents * bytesPerComponent + alphaOffset
        mask[i] = dataView.getUint8(byteOffset) < 128 ? 0 : 255
      }
    } else {
      mask.fill(255)
    }
  } else {
    for (let i = 0; i < numPixels; i++) {
      const byteOffset = i * numComponents * bytesPerComponent
      let intensity = dataView.getUint16(byteOffset) * rangeVal + baseVal

      // apply normalization
      if (
        normalizationData && normalizationData.data
        && normalizationData.data.length === numPixels
        && normalizationData.data[i] && !isNaN(normalizationData.data[i])
      ) {
        intensity = (intensity / normalizationData.data[i]) * TIC_MULTIPLIER
      } else if (
        normalizationData && normalizationData.data
          && normalizationData.data.length === numPixels) {
        intensity = 0
      }
      intensityValues[i] = intensity
    }
    if (hasAlpha) {
      const alphaOffset = (numComponents - 1) * bytesPerComponent
      for (let i = 0; i < numPixels; i++) {
        const byteOffset = i * numComponents * bytesPerComponent + alphaOffset
        mask[i] = dataView.getUint16(byteOffset, !isRGB) < 32768 ? 0 : 255
      }
    } else {
      mask.fill(255)
    }
  }

  return { intensityValues, mask }
}

function safeQuantile(values: number[], q: number): number;
function safeQuantile(values: number[], q: number[]): number[];
function safeQuantile(values: number[], q: number | number[]): any {
  // Handle cases when `values` is empty gracefully
  if (values.length > 0) {
    return quantile(values, q as any)
  } else if (typeof q === 'number') {
    return 0
  } else {
    return q.map(() => 0)
  }
}

const getQuantileValues = (intensityValues: Float32Array, mask: Uint8ClampedArray, minValueConsidered: number = 0) => {
  const values = []
  for (let i = 0; i < mask.length; i++) {
    if (intensityValues[i] > minValueConsidered && mask[i] !== 0) {
      values.push(intensityValues[i])
    }
  }
  return values
}

const getRankValues = (values: number[], lowQuantile: number, highQuantile: number) => {
  const lo = lowQuantile || 0; const hi = highQuantile || 1
  const quantiles = range(256).map(i => lo + (hi - lo) * i / 255)
  return new Float32Array(safeQuantile(values, quantiles))
}

const quantizeIonImageLinear = (intensityValues: Float32Array, minIntensity: number, maxIntensity: number) => {
  const clippedValues = new Uint8ClampedArray(intensityValues.length)
  const intensityScale = 255 / (maxIntensity - minIntensity)
  for (let i = 0; i < intensityValues.length; i++) {
    clippedValues[i] = (intensityValues[i] - minIntensity) * intensityScale
  }

  return clippedValues
}

const quantizeIonImageLog = (intensityValues: Float32Array, minIntensity: number, maxIntensity: number) => {
  const clippedValues = new Uint8ClampedArray(intensityValues.length)
  const logMinIntensity = Math.log(minIntensity)
  const intensityScale = 255 / (Math.log(maxIntensity) - logMinIntensity)

  for (let i = 0; i < intensityValues.length; i++) {
    clippedValues[i] = (Math.log(intensityValues[i]) - logMinIntensity) * intensityScale
  }

  return clippedValues
}

const quantizeIonImageRank = (intensityValues: Float32Array, rankValues: Float32Array) => {
  const clippedValues = new Uint8ClampedArray(intensityValues.length)
  const min = rankValues[0]
  const max = rankValues[255]

  for (let i = 0; i < intensityValues.length; i++) {
    const intensity = intensityValues[i]
    if (intensity < min) {
      clippedValues[i] = 0
    } else if (intensity >= max) {
      clippedValues[i] = 255
    } else {
      // Fixed-depth binary search into 256-element array
      let mid = 0
      if (intensity > rankValues[mid | 0x80]) mid |= 0x80
      if (intensity > rankValues[mid | 0x40]) mid |= 0x40
      if (intensity > rankValues[mid | 0x20]) mid |= 0x20
      if (intensity > rankValues[mid | 0x10]) mid |= 0x10
      if (intensity > rankValues[mid | 0x08]) mid |= 0x08
      if (intensity > rankValues[mid | 0x04]) mid |= 0x04
      if (intensity > rankValues[mid | 0x02]) mid |= 0x02
      if (intensity > rankValues[mid | 0x01]) mid |= 0x01
      clippedValues[i] = mid
    }
  }

  return clippedValues
}

const quantizeIonImage = (intensityValues: Float32Array, minIntensity: number, maxIntensity: number,
  rankValues: Float32Array | null, scaleMode: ScaleMode): Uint8ClampedArray => {
  if (scaleMode === 'hist') {
    return quantizeIonImageRank(intensityValues, rankValues!)
  } else if (scaleMode === 'log') {
    return quantizeIonImageLog(intensityValues, minIntensity, maxIntensity)
  } else {
    return quantizeIonImageLinear(intensityValues, minIntensity, maxIntensity)
  }
}

const quantizeScaleBar = (minIntensity: number, maxIntensity: number,
  rankValues: Float32Array | null, scaleMode: ScaleMode): Uint8ClampedArray => {
  const linearDistribution =
    new Float32Array(range(256).map(i => minIntensity + (maxIntensity - minIntensity) * i / 255))
  return quantizeIonImage(linearDistribution, minIntensity, maxIntensity, rankValues, scaleMode)
}

export const loadPngFromUrl = async(url: string): Promise<Image> => {
  const response = await fetch(url, { credentials: 'omit' })
  if (response.status !== 200) {
    throw Object.assign(
      new Error(`Invalid response fetching image: ${response.status} ${response.statusText}`),
      // Don't report 403s/404s to Sentry - they're virtually always caused by deleted datasets
      { isHandled: response.status === 403 || response.status === 404 },
    )
  }
  const buffer = await response.arrayBuffer()
  return decode(buffer)
}

export const processIonImage = (
  png: Image, minIntensity: number = 0, maxIntensity: number = 1, scaleType: ScaleType = DEFAULT_SCALE_TYPE,
  userScaling: readonly [number, number] = [0, 1],
  userIntensities: readonly [number?, number?] = [],
  normalizationData?: Normalization): IonImage => {
  const [scaleMode, lowQuantile, highQuantile] = SCALES[scaleType]
  const { width, height } = png
  let [userMin = minIntensity, userMax = maxIntensity] = userIntensities

  const { intensityValues, mask } = normalizationData?.showFullTIC
    ? getNormalizationIntensityAndMask(normalizationData)
    : extractIntensityAndMask(png, minIntensity, maxIntensity, normalizationData)

  // assign normalized intensities
  if (normalizationData && normalizationData.metadata && scaleType !== 'hist') {
    maxIntensity = normalizationData ? maxIntensity / normalizationData.metadata.maxTic * 1000000 : maxIntensity
    userMax = maxIntensity
  }

  // Only non-zero values should be considered for hotspot removal, otherwise sparse images have most of their set pixels treated as hotspots.
  // For compatibility with the previous version where images were loaded as 8-bit, linear scale's thresholds exclude pixels
  // whose values would round down to zero. This can make a big difference - some ion images have as high as 40% of
  // their pixels set to values that are zero when loaded as 8-bit but non-zero when loaded as 16-bit.
  const minValueConsidered = (scaleMode === 'linear' ? maxIntensity / 256 : 0)
  const quantileValues = getQuantileValues(intensityValues, mask, minValueConsidered)

  let min = minIntensity
  if (userMin !== minIntensity) {
    min = userMin
  } else if (scaleMode === 'log' || lowQuantile > 0) {
    min = safeQuantile(quantileValues, lowQuantile)
  }
  let max = maxIntensity
  if (userMax !== maxIntensity) {
    max = userMax
  } else if (highQuantile < 1) {
    max = safeQuantile(quantileValues, highQuantile)
  }

  const [minScale, maxScale] = userScaling
  let scaledMin = min + ((max - min) * minScale)
  let scaledMax = min + ((max - min) * maxScale)

  let rankValues = null
  if (scaleType === 'hist') {
    const { intensityValues } = normalizationData?.showFullTIC
      ? getNormalizationIntensityAndMask(normalizationData)
      : extractIntensityAndMask(png, scaledMin, scaledMax, normalizationData)
    const values = getQuantileValues(intensityValues, mask)
    rankValues = getRankValues(values, lowQuantile, highQuantile)

    // reassign intensity values to be displayed if normalized
    if (normalizationData && normalizationData.metadata) {
      maxIntensity = normalizationData ? maxIntensity / normalizationData.metadata.maxTic * 1000000 : maxIntensity
      userMax = maxIntensity
      max = maxIntensity

      if (userMax !== maxIntensity) {
        max = userMax
      } else if (highQuantile < 1) {
        max = safeQuantile(quantileValues, highQuantile)
      }
      scaledMin = min + ((max - min) * minScale)
      scaledMax = min + ((max - min) * maxScale)
    }
  }

  const clippedValues = quantizeIonImage(intensityValues, scaledMin, scaledMax, rankValues, scaleMode)
  const scaleBarValues = quantizeScaleBar(scaledMin, scaledMax, rankValues, scaleMode)

  return {
    intensityValues,
    clippedValues,
    mask,
    width,
    height,
    minIntensity,
    maxIntensity,
    clippedMinIntensity: min,
    clippedMaxIntensity: max,
    scaledMinIntensity: scaledMin,
    scaledMaxIntensity: scaledMax,
    userMinIntensity: userMin,
    userMaxIntensity: userMax,
    scaleBarValues,
    lowQuantile,
    highQuantile,
  }
}

function getCmapComponents(cmap: ColorMap, buffer : ArrayBuffer = new ArrayBuffer(256 * 4)) {
  const cmapComponents = new Uint8ClampedArray(buffer)
  for (let i = 0; i < 256; i++) {
    if (cmap != null) {
      for (let c = 0; c < 4; c++) {
        cmapComponents[i * 4 + c] = cmap[i][c]
      }
    } else {
      for (let c = 0; c < 4; c++) {
        cmapComponents[i * 4 + c] = i
      }
    }
  }
  return cmapComponents
}

export const renderIonImageToBuffer = (ionImage: IonImage, cmap: readonly number[][], buffer?: ArrayBuffer) => {
  const { clippedValues, mask } = ionImage
  // Treat pixels as 32-bit values instead of four 8-bit values to avoid extra math.
  // Assume little-endian byte order, because big-endian is pretty much gone.
  const outputBuffer = buffer || new ArrayBuffer(clippedValues.length * 4)
  const outputRGBA = new Uint32Array(outputBuffer)
  const cmapBuffer = new ArrayBuffer(256 * 4)
  const cmapRGBA = new Uint32Array(cmapBuffer)
  const emptyRGBA = 0x00000000

  getCmapComponents(cmap, cmapBuffer)

  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      outputRGBA[i] += cmapRGBA[clippedValues[i]]
    } else {
      outputRGBA[i] += emptyRGBA
    }
  }
  return outputBuffer
}

export const renderIonImages = (layers: IonImageLayer[], canvas: HTMLCanvasElement, width: number, height: number,
  roiInfo?: any[]) => {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, width, height)
  const pxBrush = new PxBrush(canvas)

  if (layers.length === 0) return

  const [base] = layers
  const { clippedValues } = base.ionImage

  const buffer = new ArrayBuffer(clippedValues.length * 4)
  const pixels = new Uint8ClampedArray(buffer)

  for (const { ionImage, colorMap } of layers) {
    const cmapComponents = getCmapComponents(colorMap)
    const { clippedValues, mask } = ionImage

    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) {
        pixels[i * 4] = 0
        pixels[i * 4 + 1] = 0
        pixels[i * 4 + 2] = 0
        pixels[i * 4 + 3] = 0
      } else {
        const v = clippedValues[i]

        for (let j = 0; j < 3; j++) {
          pixels[i * 4 + j] += cmapComponents[v * 4 + j]
        }

        // inspired by https://github.com/colorjs/color-composite/blob/master/index.js#L30
        const a1 = cmapComponents[v * 4 + 3] / 255
        const a2 = pixels[i * 4 + 3] / 255
        pixels[i * 4 + 3] = (a1 + a2 * (1 - a1)) * 255
      }
    }
    applyImageData(canvas, pixels, width, height)

    // ROI drawing
    if (roiInfo && roiInfo.length > 0 && roiInfo[roiInfo.length - 1].allVisible) {
      roiInfo.forEach((roiItem: any) => {
        if (roiItem.visible && roiItem.coordinates.length > 0) {
          ctx.beginPath()
          ctx.strokeStyle = roiItem.strokeColor
          ctx.fillStyle = roiItem.color
          ctx.lineWidth = 1
          ctx.moveTo(roiItem.coordinates[0].x, roiItem.coordinates[0].y)

          for (let index = 1; index < roiItem.coordinates.length; index++) {
            pxBrush.brush({
              from: { x: roiItem.coordinates[index - 1].x, y: roiItem.coordinates[index - 1].y },
              to: { x: roiItem.coordinates[index].x, y: roiItem.coordinates[index].y },
              size: 1,
              color: roiItem.rgb,
            })
            ctx.lineTo(roiItem.coordinates[index].x + 0.5, roiItem.coordinates[index].y + 0.5)
            if (roiItem.coordinates[index].isEndPoint) { // closes path if last point
              ctx.closePath()
            }
          }
          ctx.fill()
          ctx.stroke()
        }
      })
    }
  }
}

export const renderScaleBar = (ionImage: IonImage, cmap: ColorMap, horizontal: boolean) => {
  const outputBytes = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < ionImage.scaleBarValues.length; i++) {
    const val = ionImage.scaleBarValues[i]
    for (let j = 0; j < 4; j++) {
      outputBytes[(horizontal ? i : 255 - i) * 4 + j] = cmap[val][j]
    }
  }

  if (horizontal) {
    return createDataUrl(outputBytes, 256, 1)
  } else {
    return createDataUrl(outputBytes, 1, 256)
  }
}

export const getIonImage = (ionImagePng: any, isotopeImage: any,
  scaleType: any = 'linear', userScaling: any = [0, 1], normalizedData: any = null) => {
  if (!isotopeImage || !ionImagePng) {
    return null
  }
  const { minIntensity, maxIntensity } = isotopeImage
  return processIonImage(ionImagePng, minIntensity, maxIntensity, scaleType
    , userScaling, undefined, normalizedData)
}
