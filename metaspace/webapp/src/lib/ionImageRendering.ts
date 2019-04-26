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
  clippedMaxIntensity: number;
}

const createDataUrl = (imageData: Uint8ClampedArray, width: number, height: number) => {
  if (imageData.length != width * height * 4) {
    throw new Error('imageData must be in RGBA format');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx!.putImageData(new ImageData(imageData, width, height), 0, 0);
  return canvas.toDataURL();
};

const extractIntensityAndMask = (png: Image, min: number, max: number) => {
  const {width, height, ctype} = png;
  const pngBytes = png.data as any as Uint8Array; // The typings are wrong - `data` is always Uint8Array
  const bytesPerComponent = width <= 8 ? 1 : 2;
  const hasAlpha = ctype === 4 || ctype === 6;
  const numPixels = (width * height);
  const numComponents = (ctype & 2 ? 3 : 1) + (hasAlpha ? 1 : 0);
  const rangeVal = Number(max - min);
  const baseVal = Number(min);

  // NOTE: This function is a bit verbose. It's intentionally structured this way so that the JS engine can
  // statically determine the types of all variables involved in copying, and hopefully generate good machine code.
  const intensityValues = new Float32Array(numPixels);
  const mask = new Uint8ClampedArray(numPixels);
  if (bytesPerComponent === 1) {
    const componentArray = new Uint8Array(pngBytes.buffer);
    for (let i = 0; i < numPixels; i++) {
      intensityValues[i] = (componentArray[i * numComponents] / 255) * rangeVal + baseVal;
    }
    if (hasAlpha) {
      const alphaOffset = numComponents - 1;
      for (let i = 0; i < numPixels; i++) {
        mask[i] = componentArray[i * numComponents + alphaOffset] < 128 ? 0 : 255;
      }
    } else {
      mask.fill(255)
    }
  } else {
    const componentArray = new Uint16Array(pngBytes.buffer);
    for (let i = 0; i < numPixels; i++) {
      intensityValues[i] = (componentArray[i * numComponents] / 65535) * rangeVal + baseVal;
    }
    if (hasAlpha) {
      const alphaOffset = numComponents - 1;
      for (let i = 0; i < numPixels; i++) {
        mask[i] = componentArray[i * numComponents + alphaOffset] < 32768 ? 0 : 255;
      }
    } else {
      mask.fill(255)
    }
  }

  return {intensityValues, mask};
};

const getHotspotThreshold = (intensityValues: Float32Array, mask: Uint8ClampedArray,
                             minIntensity: number, maxIntensity: number, hotspotQuantile: number) => {
  // Extract unmasked values so that the result isn't biased by empty pixels
  const values = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 0) {
      values.push(intensityValues[i]);
    }
  }
  const threshold = quantile(values, hotspotQuantile);

  // Skip hotspot removal if it would have an insignificant effect
  // const scalingFactor = (maxIntensity - threshold) / (maxIntensity - minIntensity);
  // console.log({minIntensity, maxIntensity, threshold, scalingFactor})
  // if (scalingFactor < 0.05) {
  //   return maxIntensity;
  // } else {
    return threshold;
  // }
};

const quantizeIonImage = (intensityValues: Float32Array, mask: Uint8ClampedArray,
                          minIntensity: number, clippedMaxIntensity: number) => {
  const clippedValues = new Uint8ClampedArray(intensityValues.length);
  const intensityScale = 255 / (clippedMaxIntensity - minIntensity);

  for(let i = 0; i < mask.length; i++) {
    clippedValues[i] = (intensityValues[i] - minIntensity) * intensityScale;
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
                                hotspotQuantile = 0.99): IonImage => {
  const {width, height} = png;
  const {intensityValues, mask} = extractIntensityAndMask(png, minIntensity, maxIntensity);
  const clippedMaxIntensity = getHotspotThreshold(intensityValues, mask, minIntensity, maxIntensity, hotspotQuantile);
  const clippedValues = quantizeIonImage(intensityValues, mask, minIntensity, clippedMaxIntensity);

  return {
    intensityValues,
    clippedValues,
    mask,
    width,
    height,
    minIntensity,
    maxIntensity,
    clippedMaxIntensity,
  };
};

export const renderIonImage = (ionImage: IonImage, cmap?: number[][]) => {
  const {clippedValues, mask, width, height} = ionImage;
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

  return createDataUrl(new Uint8ClampedArray(outputBuffer), width, height);
};



