
export interface FitImageToAreaArgs {
  imageWidth: number;
  imageHeight: number;
  areaWidth: number;
  areaHeight: number;
  // Provide areaMinWidth/areaMinHeight if the area is able to shrink. Otherwise leave undefined for a constant size.
  areaMinWidth?: number;
  areaMinHeight?: number;
  minZoom?: number;
  maxZoom?: number;
  mode?: 'contain' | 'cover';
}

export interface FitImageToAreaResult {
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  imageZoom: number;
  areaWidth: number;
  areaHeight: number;
}

const clip = (val: number, min?: number | null, max?: number | null) => {
  return Math.min(Math.max(val, min != null ? min : -Infinity), max != null ? max : Infinity)
}

const fitImageToArea = (args: FitImageToAreaArgs): FitImageToAreaResult => {
  const { imageWidth, imageHeight, areaWidth, areaHeight, minZoom, maxZoom } = args
  const { areaMinWidth = areaWidth, areaMinHeight = areaHeight, mode = 'contain' } = args

  const imageAspect = imageWidth / imageHeight
  const areaAspect = areaWidth / areaHeight
  const isTall = imageAspect < areaAspect
  let imageZoom

  if (isTall && mode === 'contain' || !isTall && mode === 'cover') {
    imageZoom = areaHeight / imageHeight
  } else {
    imageZoom = areaWidth / imageWidth
  }

  imageZoom = clip(imageZoom, minZoom, maxZoom)

  const fittedImageWidth = imageWidth * imageZoom
  const fittedImageHeight = imageHeight * imageZoom
  const fittedAreaWidth = clip(fittedImageWidth, areaMinWidth, areaWidth)
  const fittedAreaHeight = clip(fittedImageHeight, areaMinHeight, areaHeight)
  const imageX = fittedAreaWidth / 2 - fittedImageWidth / 2
  const imageY = fittedAreaHeight / 2 - fittedImageHeight / 2

  return {
    imageX: imageX,
    imageY: imageY,
    imageWidth: fittedImageWidth,
    imageHeight: fittedImageHeight,
    imageZoom: imageZoom,
    areaWidth: fittedAreaWidth,
    areaHeight: fittedAreaHeight,
  }
}

export default fitImageToArea
