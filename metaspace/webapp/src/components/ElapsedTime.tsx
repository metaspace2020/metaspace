import './ElapsedTime.css'

import { createComponent } from '@vue/composition-api'
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

export default createComponent({
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
        {valid ? distanceInWords(Date.now(), parsedDate, dateConfig) : 'some time ago'}
      </span>
    )
  },
})
