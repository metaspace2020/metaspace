import './ElapsedTime.css'

import { createComponent } from '@vue/composition-api'
import distanceInWords from 'date-fns/distance_in_words_strict'
import parse from 'date-fns/parse'
import isValid from 'date-fns/is_valid'

function getTitle(date: Date) {
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

const opts = {
  addSuffix: true
}

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
        {valid ? distanceInWords(new Date(), parsedDate, opts) : 'some time ago'}
      </span>
    )
  },
})
