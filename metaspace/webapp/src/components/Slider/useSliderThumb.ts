import { Ref, computed } from '@vue/composition-api'

interface SliderProps {
  value: number
  min: number
  max: number
  step: number
}

interface Range {
  minX: number
  maxX: number
}

export type SliderThumbInstance = {
  x: Ref<number>,
  pixelStep: Ref<number>,
  getValue: (x: number) => number,
}

export default (getProps: () => SliderProps, range: Ref<Range>, bounds: Ref<Range> = range) : SliderThumbInstance => {
  function getValue(x: number) {
    const boundedX = Math.min(Math.max(x, bounds.value.minX), bounds.value.maxX)

    const { max, min, step } = getProps()

    const ratio = (boundedX - range.value.minX) / (range.value.maxX - range.value.minX)
    let value = ratio * (max - min) + min

    if (step !== 0.0) {
      value = step * Math.floor((value / step))
    }

    return value
  }

  return {
    getValue,
    x: computed(() => {
      const { value, min, max } = getProps()
      const ratio = ((value - min) / (max - min))
      return Math.ceil(ratio * (range.value.maxX - range.value.minX) + range.value.minX)
    }),
    pixelStep: computed(() => {
      const { max, min, step } = getProps()
      return step * ((range.value.maxX - range.value.minX) / (max - min))
    }),
  }
}
