import { defineComponent } from '@vue/composition-api'
import distanceInWords from 'date-fns/distance_in_words_strict'
import parse from 'date-fns/parse'
import isValid from 'date-fns/is_valid'

const formatOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}

function getTitle(date: Date) {
  return date.toLocaleString([], formatOptions)
}

const dateConfig = { addSuffix: true }
const seconds = /seconds/

function getValue(date: Date) {
  const value = distanceInWords(Date.now(), date, dateConfig)
  if (seconds.test(value)) {
    return 'just now'
  }
  return value
}

export default defineComponent({
  name: 'ElapsedTime',
  props: {
    date: { type: String, required: true },
  },
  setup(props) {
    const parsedDate = parse(props.date)
    const valid = isValid(parsedDate)
    return () => (
      <span
        class="sm-elapsed-time"
        title={valid ? getTitle(parsedDate) : 'Date unavailable'}
      >
        {valid ? getValue(parsedDate) : 'some time ago'}
      </span>
    )
  },
})
