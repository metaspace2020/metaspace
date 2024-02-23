import { defineComponent, computed } from 'vue'
// @ts-ignore
import { parseISO, formatDistanceToNow, isValid } from 'date-fns'

const formatOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}

export default defineComponent({
  name: 'ElapsedTime',
  props: ['date'],
  setup(props) {
    const parsedDate = computed(() => parseISO(props.date))
    const valid = computed(() => isValid(parsedDate.value))

    const title = computed(() =>
      valid.value ? parsedDate.value.toLocaleString([], formatOptions) : 'Date unavailable'
    )

    const elapsedTime = computed(() => {
      if (!valid.value) {
        return 'some time ago'
      }
      const value = formatDistanceToNow(parsedDate.value, { addSuffix: true })
      return value.includes('seconds') ? 'just now' : value
    })

    return () => (
      <span class="sm-elapsed-time" title={title.value}>
        {elapsedTime.value}
      </span>
    )
  },
})
