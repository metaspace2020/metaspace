import './ProgressRing.css'

import { defineComponent, computed } from '@vue/composition-api'

interface Props {
  radius: number,
  progress: number,
  stroke: number,
}

// https://css-tricks.com/building-progress-ring-quickly/
export default defineComponent<Props>({
  name: 'ProgressRing',
  props: {
    radius: Number,
    progress: Number,
    stroke: Number,
  },
  setup(props) {
    // const normalizedRadius = computed(() => props.radius - props.stroke * 2)
    const circumference = computed(() => props.radius * 2 * Math.PI)
    const progress = computed(() => Math.max(props.progress, 1))
    const strokeDashoffset = computed(() => circumference.value - progress.value / 100 * circumference.value)

    return () => (
      <svg height={props.radius * 2} width={props.radius * 2} class="overflow-visible sm-progress-ring">
        <circle
          class="stroke-current transform origin-center -rotate-90 duration-300 ease-in-out"
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
