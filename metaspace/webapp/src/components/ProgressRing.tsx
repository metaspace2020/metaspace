import { createComponent, computed } from '@vue/composition-api'

interface Props {
  radius: number,
  progress: number,
  stroke: number,
}

// https://css-tricks.com/building-progress-ring-quickly/
export default createComponent<Props>({
  props: {
    radius: Number,
    progress: Number,
    stroke: Number,
  },
  setup(props) {
    // const normalizedRadius = computed(() => props.radius - props.stroke * 2)
    const circumference = computed(() => props.radius * 2 * Math.PI)
    const strokeDashoffset = computed(() => circumference.value - props.progress / 100 * circumference.value)

    return () => (
      <svg height={props.radius * 2} width={props.radius * 2} class="overflow-visible">
        <circle
          class="stroke-current transform origin-center -rotate-90 transition-dashoffset duration-300"
          fill="transparent"
          stroke-dasharray={`${circumference.value} ${circumference.value}`}
          style={{ strokeDashoffset: strokeDashoffset.value }}
          stroke-width={props.stroke}
          r={props.radius}
          cx={props.radius}
          cy={props.radius}
        />
      </svg>
    )
  },
})
