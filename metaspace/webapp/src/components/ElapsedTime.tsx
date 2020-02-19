import './ElapsedTime.css'

import { createComponent } from '@vue/composition-api'
import formatDistanceToNow from 'date-fns/distance_in_words_to_now'
import parse from 'date-fns/parse'
import isValid from 'date-fns/is_valid'

function toLocaleFormat(date: string): string {
  const parsedDate = parse(date)
  return isValid(parsedDate) ? parsedDate.toLocaleString() : ''
}

export default createComponent({
  props: {
    date: { type: String, required: true },
  },
  setup(props) {
    return () => (
      <span
        class="sm-elapsed-time"
        title={toLocaleFormat(props.date)}
      >
        {formatDistanceToNow(props.date)} ago
      </span>
    )
  },
})
