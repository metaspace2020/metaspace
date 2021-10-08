import { Ref, computed } from '@vue/composition-api'

interface SliderProps {
  value: number
  min: number
  max: number
  step: number
  minBound?: number
  maxBound?: number
}

interface Range {
  minX: number
  maxX: number
}

export type SliderThumbInstance = {
  x: Ref<number>,
  getValue: (x: number) => number,
  increment: (factor: number) => number,
  decrement: (factor: number) => number,
}

function applyBounds(value: number, { min, minBound = min, max, maxBound = max } : SliderProps) {
  if (value < minBound) return minBound
  if (value > maxBound) return maxBound
  return value
}

export default (getProps: () => SliderProps, range: Ref<Range>) : SliderThumbInstance => {
  return {
    getValue(x: number) {
      const props = getProps()
      const { max, min, step } = props

      const ratio = (x - range.value.minX) / (range.value.maxX - range.value.minX)
      let value = ratio * (max - min) + min

      if (step !== 0.0) {
        value = step * Math.floor((value / step))
      }

      return applyBounds(value, props)
    },
    x: computed(() => {
      const { value, min, max } = getProps()
      const ratio = ((value - min) / (max - min))
      return Math.ceil(ratio * (range.value.maxX - range.value.minX) + range.value.minX)
    }),
    increment(factor) {
      const props = getProps()
      return applyBounds(props.value + (props.step * factor), props)
    },
    decrement(factor) {
      const props = getProps()
      return applyBounds(props.value - (props.step * factor), props)
    },
  }
}
