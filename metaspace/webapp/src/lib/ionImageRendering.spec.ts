import { Normalization, processIonImage, renderIonImageToBuffer } from './ionImageRendering'
import { range, times } from 'lodash-es'
import { decode, encodeLL, Image } from 'upng-js'
import { readFile } from 'fs'
import { promisify } from 'util'
import * as path from 'path'
import createColormap from './createColormap'
const readFileAsync = promisify(readFile)

const getGradientPng = (is16Bit = true, isGrayscale = true, hasAlpha = true, length = 256): Image => {
  const values = is16Bit ? range(0, 65536, Math.ceil(65536 / length)) : range(0, 256, Math.ceil(256 / length))
  const componentSize = is16Bit ? 2 : 1
  const numComponents = (isGrayscale ? 1 : 3) + (hasAlpha ? 1 : 0)
  const stride = numComponents * componentSize
  const data = new ArrayBuffer(stride * values.length)
  const dataView = new DataView(data)

  values.forEach((v, i) => {
    for (let j = 0; j < numComponents; j++) {
      if (is16Bit) {
        dataView.setUint16(i * stride + j * componentSize, v, false)
      } else {
        dataView.setUint8(i * stride + j * componentSize, v)
      }
    }
  })

  return decode(encodeLL([data], values.length, 1,
    isGrayscale ? 1 : 3, hasAlpha ? 1 : 0, is16Bit ? 16 : 8))
}

const getNormalizedData = (is16Bit = true, isGrayscale = true, hasAlpha = true,
  length = 256): Normalization => {
  const values = is16Bit ? range(0, 65536, Math.ceil(65536 / length))
    : range(0, 256, Math.ceil(256 / length))
  const componentSize = is16Bit ? 2 : 1
  const numComponents = (isGrayscale ? 1 : 3) + (hasAlpha ? 1 : 0)

  return {
    data: new Float32Array(range(values.length)),
    shape: [numComponents, componentSize],
    metadata: {},
    type: 'TIC',
    error: false,
    showFullTIC: false,
  }
}

describe('ionImageRendering.ts', () => {
  [false, true].forEach(is16Bit => {
    [false, true].forEach(isRGBA => {
      const bits = is16Bit ? 16 : 8
      const colorType = isRGBA ? 'RGBA' : 'Grayscale'
      test(`processIonImage correctly decodes a ${bits}-bit ${colorType} image`, () => {
        const png = getGradientPng(is16Bit, !isRGBA)

        const image = processIonImage(png, 0, 1, 'test')

        expect(image.width).toBe(256)
        expect(image.height).toBe(1)
        expect(image.minIntensity).toBe(0)
        expect(image.maxIntensity).toBe(1)
        expect(image.clippedMaxIntensity).toBeCloseTo(0.75)
        // First half of image should be masked as it is below the alpha threshold
        expect(Array.from(image.mask.slice(0, 128))).toEqual(times(128, () => 0))
        // Second half shouldn't be masked
        expect(Array.from(image.mask.slice(128, 256))).toEqual(times(128, () => 255))
        // Second half of intensity values should be a linear gradient
        range(128, 256).forEach(i => {
          expect(image.intensityValues[i]).toBeCloseTo(i / 256)
        })
        // First half of non-masked pixels should be a linear gradient to 255
        range(128, 192).forEach(i => {
          expect(image.clippedValues[i]).toBeCloseTo(i / 0.75, -1)
        })
        // Second half of non-masked pixels should be clipped to 255
        range(193, 256).forEach(i => {
          expect(image.clippedValues[i]).toBe(255)
        })
      })

      test(`processIonImage correctly decodes a ${bits}-bit ${colorType} image without alpha`, () => {
        const png = getGradientPng(is16Bit, isRGBA, false)

        const image = processIonImage(png, 0, 1, 'test')

        expect(image.width).toBe(256)
        expect(image.height).toBe(1)
        expect(image.minIntensity).toBe(0)
        expect(image.maxIntensity).toBe(1)
        expect(image.clippedMaxIntensity).toBeCloseTo(0.5)

        // None of the image should be masked
        expect(Array.from(image.mask)).toEqual(times(256, () => 255))
        // Intensity values should be a linear gradient
        range(0, 256).forEach(i => {
          expect(image.intensityValues[i]).toBeCloseTo(i / 256)
        })
        // First half of clipped values should be a gradient from 0 to 255
        range(0, 128).forEach(i => {
          expect(image.clippedValues[i]).toBeCloseTo(i * 2, -1)
        })
        // Second half of clipped values should be clipped to 255
        range(128, 256).forEach(i => {
          expect(image.clippedValues[i]).toBe(255)
        })
      })
    })
  })

  test('processIonImage should scale intensity range', () => {
    const png = getGradientPng()
    const image = processIonImage(png, 0, 1, 'linear-full', [0.25, 0.75])
    expect(image.scaledMinIntensity).toBe(0.25)
    expect(image.scaledMaxIntensity).toBe(0.75)
  })

  test('processIonImage should normalize intensity', () => {
    const png = getGradientPng()
    const image = processIonImage(png, 0, 1, 'linear-full',
      [0.25, 0.75])
    const imageNormalized = processIonImage(png, 0, 1, 'linear-full',
      [0.25, 0.75], undefined,
      getNormalizedData())

    expect(image.intensityValues).not.toBe(imageNormalized.intensityValues)
  })

  test('processIonImage should not clip if user intensities provided', () => {
    const png = getGradientPng()

    const image1 = processIonImage(png, 0, 1, 'log', undefined, [undefined, 0.75])
    expect(image1.clippedMinIntensity).not.toBe(image1.userMinIntensity)
    expect(image1.clippedMaxIntensity).toBe(image1.userMaxIntensity)

    const image2 = processIonImage(png, 0, 1, 'log', undefined, [0.25, undefined])
    expect(image2.clippedMinIntensity).toBe(image2.userMinIntensity)
    expect(image2.clippedMaxIntensity).not.toBe(image2.userMaxIntensity)
  })

  test('renderIonImage result is similar to reference result produced with METASPACE v1.3', async() => {
    const ionImageFile = await readFileAsync(path.resolve(__dirname, './testdata/ion_image.png'))
    const referencePngFile = await readFileAsync(path.resolve(__dirname, './testdata/reference_colorized.png'))
    const ionImagePng = decode(ionImageFile.buffer as ArrayBuffer)
    const referencePng = decode(referencePngFile.buffer as ArrayBuffer)
    const referenceData = new Uint8ClampedArray(referencePng.data)
    const byteLength = referencePng.width * referencePng.height * 4

    const ionImage = processIonImage(ionImagePng)
    const renderedIonImage = renderIonImageToBuffer(ionImage, createColormap('Viridis'))
    const renderedData = new Uint8ClampedArray(renderedIonImage)

    expect(renderedData.length).toEqual(byteLength)
    for (let i = 0; i < byteLength; i += 4) {
      // expected vs actual RGBA should be +/- 4 values
      const [er, eg, eb, ea] = referenceData.slice(i, i + 4) as any as number[]
      const [ar, ag, ab, aa] = renderedData.slice(i, i + 4) as any as number[]
      expect(ar).toBeGreaterThan(er - 4)
      expect(ar).toBeLessThan(er + 4)
      expect(ag).toBeGreaterThan(eg - 4)
      expect(ag).toBeLessThan(eg + 4)
      expect(ab).toBeGreaterThan(eb - 4)
      expect(ab).toBeLessThan(eb + 4)
      expect(aa).toEqual(ea)
    }
  })
})
