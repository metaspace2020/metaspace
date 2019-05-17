// A 1x256 linear gradient between (0,0,0,0) and (255,255,255,255)

import {getHotspotThreshold, processIonImage, renderIonImage} from './ionImageRendering';
import {range, times} from 'lodash-es';
import {decode, encodeLL, Image} from 'upng-js';

const getGradientPng = (is16Bit = true, isGrayscale = true, hasAlpha = true, length = 256): Image => {
  const values = is16Bit ? range(0, 65536, Math.ceil(65536/length)) : range(0, 256, Math.ceil(256/length));
  const componentSize = is16Bit ? 2 : 1;
  const numComponents = (isGrayscale ? 1 : 3) + (hasAlpha ? 1 : 0);
  const stride = numComponents * componentSize;
  const data = new ArrayBuffer(stride * values.length);
  const dataView = new DataView(data);

  values.forEach((v, i) => {
    for (let j = 0; j < numComponents; j++) {
      if (is16Bit) {
        dataView.setUint16(i * stride + j * componentSize, v, false);
      } else {
        dataView.setUint8(i * stride + j * componentSize, v);
      }
    }
  });

  return decode(encodeLL([data], values.length, 1,
    isGrayscale ? 1 : 3, hasAlpha ? 1 : 0, is16Bit ? 16 : 8));
};


describe('ionImageRendering.ts', () => {
  [false, true].forEach(is16Bit => {
    [false, true].forEach(isRGBA => {
      const bits = is16Bit ? 16 : 8;
      const colorType = isRGBA ? 'RGBA' : 'Grayscale';
      test(`processIonImage correctly decodes a ${bits}-bit ${colorType} image`, () => {
        const png = getGradientPng(is16Bit, isRGBA);

        const image = processIonImage(png, 0, 1, 0.5);

        expect(image.width).toBe(256);
        expect(image.height).toBe(1);
        expect(image.minIntensity).toBe(0);
        expect(image.maxIntensity).toBe(1);
        expect(image.clippedMaxIntensity).toBeCloseTo(0.75);
        // First half of image should be masked as it is below the alpha threshold
        expect(Array.from(image.mask.slice(0, 128))).toEqual(times(128, () => 0));
        // Second half shouldn't be masked
        expect(Array.from(image.mask.slice(128, 256))).toEqual(times(128, () => 255));
        // Second half of intensity values should be a linear gradient
        range(128, 256).forEach(i => {
          expect(image.intensityValues[i]).toBeCloseTo(i/256)
        });
        // First half of non-masked pixels should be a linear gradient to 255
        range(128, 192).forEach(i => {
          expect(image.clippedValues[i]).toBeCloseTo(i/0.75, -1);
        });
        // Second half of non-masked pixels should be clipped to 255
        range(193, 256).forEach(i => {
          expect(image.clippedValues[i]).toBe(255);
        });
      });

      test(`processIonImage correctly decodes a ${bits}-bit ${colorType} image without alpha`, () => {
        const png = getGradientPng(is16Bit, isRGBA, false);

        const image = processIonImage(png, 0, 1, 0.5);

        expect(image.width).toBe(256);
        expect(image.height).toBe(1);
        expect(image.minIntensity).toBe(0);
        expect(image.maxIntensity).toBe(1);
        expect(image.clippedMaxIntensity).toBeCloseTo(0.5);

        // None of the image should be masked
        expect(Array.from(image.mask)).toEqual(times(256, () => 255));
        // Intensity values should be a linear gradient
        range(0, 256).forEach(i => {
          expect(image.intensityValues[i]).toBeCloseTo(i/256)
        });
        // First half of clipped values should be a gradient from 0 to 255
        range(0, 128).forEach(i => {
          expect(image.clippedValues[i]).toBeCloseTo(i * 2, -1);
        });
        // Second half of clipped values should be clipped to 255
        range(128, 256).forEach(i => {
          expect(image.clippedValues[i]).toBe(255);
        });
      });
    });
  });

  test(`getHotspotThreshold is compatible with legacy 8-bit hotspot clipping`, () => {
    const intensityValues = new Float32Array([
      // Values below 1/256th of maxIntensity should influence the median
      0, 1280, 2550,
      // Values equal to or above 1/256th of maxIntensity should be considered
      // The 0.5th quantile should be the 3rd item out of these numbers
      2560, 2560, 327680, 655350, 655350]);
    const mask = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);

    const result = getHotspotThreshold(intensityValues, mask, 0, 655350, 0.5);

    expect(result).toBe(327680);
  })
});
