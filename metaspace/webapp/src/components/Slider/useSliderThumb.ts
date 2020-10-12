import { reactive, Ref, onMounted, toRefs, computed } from '@vue/composition-api'

interface SliderProps {
  value: number
  min: number
  max: number
  step: number
}

interface State {
  x: number
}

interface Range {
  min: number
  max: number
}

type Return = {
  x: Ref<number>,
  pixelStep: Ref<number>,
  setX: (x: number) => number,
}

export default (props: SliderProps, range: Ref<Range>, bounds: Ref<Range> = range) : Return => {
  const state = reactive<State>({
    x: 0,
  })

  onMounted(() => {
    const { value, min, max } = props
    const initialValue = Math.min(Math.max(value, min), max)
    const ratio = ((initialValue - min) / (max - min))
    state.x = Math.ceil(ratio * (range.value.max - range.value.min))
  })

  function setX(x: number) {
    const boundedX = Math.min(Math.max(x, bounds.value.min), bounds.value.max)
    state.x = boundedX

    const { max, min, step } = props

    const ratio = boundedX / (range.value.max - range.value.min)
    let value = ratio * (max - min) + min

    if (step !== 0.0) {
      value = step * Math.floor((value / step))
    }

    return value
  }

  const { x } = toRefs(state)

  return {
    x,
    setX,
    pixelStep: computed(() =>
      props.step * ((range.value.max - range.value.min) / (props.max - props.min)),
    ),
  }
}
