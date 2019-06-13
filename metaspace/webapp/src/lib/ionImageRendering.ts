import {decode, Image} from 'upng-js';
import {quantile} from 'simple-statistics';

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
  minQuantile: number;
  maxQuantile: number;
}

export type ScaleType = 'linear' | 'log';

const createDataUrl = (imageBytes: Uint8ClampedArray, width: number, height: number) => {
  if (imageBytes.length != width * height * 4) {
    throw new Error('imageBytes must be in RGBA format');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  let imageData: ImageData;
  try {
    imageData = new ImageData(imageBytes, width, height)
  } catch (ex) {
    // IE11 doesn't support `new ImageData`, so it gets the slow path
    imageData = ctx.createImageData(width, height);
    imageData.data.set(imageBytes);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
};

const extractIntensityAndMask = (png: Image, min: number, max: number) => {
  const {width, height, depth, ctype} = png;
  const bytesPerComponent = depth <= 8 ? 1 : 2;
  const hasAlpha = ctype === 4 || ctype === 6;
  const numPixels = (width * height);
  const numComponents = (ctype & 2 ? 3 : 1) + (hasAlpha ? 1 : 0);
  const rangeVal = Number(max - min) / (bytesPerComponent === 1 ? 255 : 65535);
  const baseVal = Number(min);
  // NOTE: pngDataBuffer usually has some trailing padding bytes. TypedArrays should have explicit sizes specified to prevent over-reading
  const pngDataBuffer = (png.data as any as Uint8Array).buffer; // The typings are wrong

  // NOTE: This function is a bit verbose. It's intentionally structured this way so that the JS engine can
  // statically determine the types of all variables involved in copying, and hopefully generate fast machine code.
  const intensityValues = new Float32Array(numPixels);
  const mask = new Uint8ClampedArray(numPixels);
  const dataView = new DataView(pngDataBuffer, 0, numPixels * numComponents * bytesPerComponent);
  if (bytesPerComponent === 1) {
    for (let i = 0; i < numPixels; i++) {
      const byteOffset = i * numComponents * bytesPerComponent;
      intensityValues[i] = dataView.getUint8(byteOffset) * rangeVal + baseVal;
    }
    if (hasAlpha) {
      const alphaOffset = numComponents - 1;
      for (let i = 0; i < numPixels; i++) {
        const byteOffset = i * numComponents * bytesPerComponent + alphaOffset;
        mask[i] = dataView.getUint8(byteOffset) < 128 ? 0 : 255;
      }
    } else {
      mask.fill(255)
    }
  } else {
    for (let i = 0; i < numPixels; i++) {
      const byteOffset = i * numComponents * bytesPerComponent;
      intensityValues[i] = dataView.getUint16(byteOffset, false) * rangeVal + baseVal;
    }
    if (hasAlpha) {
      const alphaOffset = (numComponents - 1) * bytesPerComponent;
      for (let i = 0; i < numPixels; i++) {
        const byteOffset = i * numComponents * bytesPerComponent + alphaOffset;
        mask[i] = dataView.getUint16(byteOffset, false) < 32768 ? 0 : 255;
      }
    } else {
      mask.fill(255)
    }
  }

  return {intensityValues, mask};
};

const getClippedMinIntensity = (intensityValues: Float32Array, minIntensity: number, scaleType: ScaleType) => {
  if (scaleType === 'log') {
    // Get minimum non-zero value, because log(0) is invalid
    let minValue = Infinity;
    for (let i = 0; i < intensityValues.length; i++) {
      if (intensityValues[i] > 0 && intensityValues[i] < minValue) {
        minValue = intensityValues[i];
      }
    }
    return Math.log(minValue);
  } else {
    return minIntensity;
  }
};

const getMinMaxThresholds = (intensityValues: Float32Array, mask: Uint8ClampedArray,
                             minIntensity: number, maxIntensity: number,
                             logFloorQuantile: number, hotspotQuantile: number, scaleType: ScaleType) => {
  // Only non-zero values should be considered for hotspot removal, otherwise sparse images have most of their set pixels treated as hotspots.
  // For compatibility with the previous version where images were loaded as 8-bit, this also excludes pixels
  // whose values would round down to zero. This can make a big difference - some ion images have as high as 40% of
  // their pixels set to values that are zero when loaded as 8-bit but non-zero when loaded as 16-bit.
  const minValueConsidered = maxIntensity / 256;
  const maxThresholdValues = [];

  for (let i = 0; i < mask.length; i++) {
    if (intensityValues[i] >= minValueConsidered && mask[i] !== 0) {
      maxThresholdValues.push(intensityValues[i]);
    }
  }
  const maxThreshold = quantile(maxThresholdValues, hotspotQuantile);

  let minThreshold;
  if (scaleType === 'log') {
    // minThreshold doesn't need backwards compatibility with 8-bit values. Logarithmic images look a lot better if
    // very small values are allowed to count towards the lower threshold
    const minThresholdValues = [];
    for (let i = 0; i < mask.length; i++) {
      if (intensityValues[i] > 0 && mask[i] !== 0) {
        minThresholdValues.push(intensityValues[i]);
      }
    }
    minThreshold = quantile(minThresholdValues, logFloorQuantile);
  } else {
    minThreshold = minIntensity;
  }

  return [minThreshold, maxThreshold];
};

const quantizeIonImage = (intensityValues: Float32Array,
                          clippedMinIntensity: number, clippedMaxIntensity: number, scaleType: ScaleType) => {
  const clippedValues = new Uint8ClampedArray(intensityValues.length);

  if (scaleType === 'log') {
    const logMinIntensity = Math.log(clippedMinIntensity);
    const intensityScale = 255 / (Math.log(clippedMaxIntensity) - logMinIntensity);

    for (let i = 0; i < intensityValues.length; i++) {
      clippedValues[i] = (Math.log(intensityValues[i]) - logMinIntensity) * intensityScale;
    }
  } else {
    const intensityScale = 255 / (clippedMaxIntensity - clippedMinIntensity);

    for (let i = 0; i < intensityValues.length; i++) {
      clippedValues[i] = (intensityValues[i] - clippedMinIntensity) * intensityScale;
    }
  }

  return clippedValues;
};

export const loadPngFromUrl = async (url: string) => {
  const response = await fetch(url, {credentials: 'omit'});
  if (response.status !== 200) {
    throw new Error(`Invalid response fetching image: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return decode(buffer);
};

export const processIonImage = (png: Image, minIntensity: number = 0, maxIntensity: number = 1,
                                hotspotQuantile = 0.99, scaleType: ScaleType = 'linear'): IonImage => {
  const logFloorQuantile = 0.01;
  const {width, height} = png;
  const {intensityValues, mask} = extractIntensityAndMask(png, minIntensity, maxIntensity);
  const [clippedMinIntensity, clippedMaxIntensity] = getMinMaxThresholds(intensityValues, mask,
    minIntensity, maxIntensity, logFloorQuantile, hotspotQuantile, scaleType);
  const clippedValues = quantizeIonImage(intensityValues, clippedMinIntensity, clippedMaxIntensity, scaleType);

  return {
    intensityValues,
    clippedValues,
    mask,
    width,
    height,
    minIntensity,
    maxIntensity,
    clippedMinIntensity,
    clippedMaxIntensity,
    minQuantile: scaleType === 'log' ? logFloorQuantile : 0,
    maxQuantile: hotspotQuantile,
  };
};

export const renderIonImageToBuffer = (ionImage: IonImage, cmap?: number[][]) => {
  const {clippedValues, mask} = ionImage;
  // Treat pixels as 32-bit values instead of four 8-bit values to avoid extra math.
  // Assume little-endian byte order, because big-endian is pretty much gone.
  const outputBuffer = new ArrayBuffer(clippedValues.length * 4);
  const outputRGBA = new Uint32Array(outputBuffer);
  const cmapBuffer = new ArrayBuffer(256 * 4);
  const cmapComponents = new Uint8ClampedArray(cmapBuffer);
  const cmapRGBA = new Uint32Array(cmapBuffer);
  const emptyRGBA = 0x00000000;

  for (let i = 0; i < 256; i++) {
    if (cmap != null) {
      for (let c = 0; c < 4; c++) {
        cmapComponents[i * 4 + c] = cmap[i][c];
      }
    } else {
      for (let c = 0; c < 4; c++) {
        cmapComponents[i * 4 + c] = i;
      }
    }
  }

  for(let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      outputRGBA[i] = cmapRGBA[clippedValues[i]];
    } else {
      outputRGBA[i] = emptyRGBA;
    }
  }
  return outputBuffer;
};

export const renderIonImage = (ionImage: IonImage, cmap?: number[][]) => {
  const {width, height} = ionImage;

  const outputBuffer = renderIonImageToBuffer(ionImage, cmap);

  return createDataUrl(new Uint8ClampedArray(outputBuffer), width, height);
};



