import fitImageToArea, { FitImageToAreaArgs, FitImageToAreaResult } from './fitImageToArea'

interface TestCase {
  name: string;
  input: FitImageToAreaArgs;
  output: FitImageToAreaResult;
}

const standardArgs: FitImageToAreaArgs = {
  imageWidth: 100,
  imageHeight: 100,
  areaWidth: 100,
  areaHeight: 100,
}
const standardResult: FitImageToAreaResult = {
  imageWidth: 100,
  imageHeight: 100,
  areaWidth: 100,
  areaHeight: 100,
  imageX: 0,
  imageY: 0,
  imageZoom: 1,
}

describe('fitImageToArea', () => {
  const testCases: TestCase[] = [
    {
      name: 'Equal-sized image exactly fits',
      input: { ...standardArgs },
      output: { ...standardResult },
    },
    {
      name: 'Large image is zoomed out',
      input: { ...standardArgs, imageWidth: 200, imageHeight: 200 },
      output: { ...standardResult, imageZoom: 0.5 },
    },
    {
      name: 'Tall image is zoomed out',
      input: { ...standardArgs, imageHeight: 200 },
      output: { ...standardResult, imageX: 25, imageWidth: 50, imageZoom: 0.5 },
    },
    {
      name: 'Wide image is zoomed out',
      input: { ...standardArgs, imageWidth: 200 },
      output: { ...standardResult, imageY: 25, imageHeight: 50, imageZoom: 0.5 },
    },
    {
      name: 'Small image is zoomed in',
      input: { ...standardArgs, imageWidth: 50, imageHeight: 25 },
      output: { ...standardResult, imageY: 25, imageHeight: 50, imageZoom: 2 },
    },
    {
      name: 'Tall image can shrink area',
      input: { ...standardArgs, imageWidth: 25, imageHeight: 50, areaMinHeight: 0, areaMinWidth: 0 },
      output: { ...standardResult, imageWidth: 50, imageZoom: 2, areaWidth: 50 },
    },
    {
      name: 'Wide image can shrink area & areaMinWidth is respected',
      input: { ...standardArgs, imageWidth: 500, areaMinHeight: 25, areaMinWidth: 25 },
      output: { ...standardResult, imageY: 2.5, imageHeight: 20, imageZoom: 0.2, areaHeight: 25 },
    },
    {
      name: 'minZoom is respected',
      input: { ...standardArgs, imageWidth: 400, minZoom: 0.5 },
      output: { ...standardResult, imageX: -50, imageY: 25, imageWidth: 200, imageHeight: 50, imageZoom: 0.5 },
    },
    {
      name: 'maxZoom is respected',
      input: { ...standardArgs, imageWidth: 20, maxZoom: 0.5 },
      output: { ...standardResult, imageX: 45, imageY: 25, imageWidth: 10, imageHeight: 50, imageZoom: 0.5 },
    },
    {
      name: 'mode=\'cover\' works for small images',
      input: { ...standardArgs, imageWidth: 50, mode: 'cover' },
      output: { ...standardResult, imageX: 0, imageY: -50, imageWidth: 100, imageHeight: 200, imageZoom: 2 },
    },
    {
      name: 'mode=\'cover\' works for large images',
      input: { ...standardArgs, imageWidth: 200, mode: 'cover' },
      output: { ...standardResult, imageX: -50, imageY: 0, imageWidth: 200, imageHeight: 100, imageZoom: 1 },
    },
  ]

  testCases.forEach(({ name, input, output }) => {
    test(`Test case: ${name}`, () => {
      const result = fitImageToArea(input)

      expect(result).toMatchObject(output)
    })
  })
})
