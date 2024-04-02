import { defineComponent, computed } from 'vue'
// Import moment
import moment from 'moment'

export default defineComponent({
  name: 'ElapsedTime',
  props: ['date'],
  setup(props) {
    const parsedDate = computed(() => moment(props.date))
    const valid = computed(() => parsedDate.value.isValid())

    const title = computed(() => {
      if (!valid.value) {
        return 'Date unavailable'
      }
      return parsedDate.value.format('YYYY/MM/DD, HH:mm')
    })

    const elapsedTime = computed(() => {
      if (!valid.value) {
        return 'some time ago'
      }
      const value = parsedDate.value.fromNow(true) // true to remove suffix
      return value.includes('seconds') ? 'just now' : value + ' ago'
    })

    return () => (
      <span class="sm-elapsed-time" title={title.value}>
        {elapsedTime.value}
      </span>
    )
  },
})
