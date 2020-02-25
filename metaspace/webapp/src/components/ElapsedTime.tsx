import './ElapsedTime.css'

import { createComponent } from '@vue/composition-api'
import distanceInWords from 'date-fns/distance_in_words_strict'
import parse from 'date-fns/parse'
import isValid from 'date-fns/is_valid'

const timeConfig: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }

function getTitle(date: Date, locale: string | string[] | undefined = []) {
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString(locale, timeConfig)}`
}

const dateConfig = { addSuffix: true }

export default createComponent({
  props: {
    date: { type: String, required: true },
    locale: { type: String }, // normally for testing
  },
  setup(props) {
    const parsedDate = parse(props.date)
    const valid = isValid(parsedDate)
    return () => (
      <span
        class="sm-elapsed-time"
        title={valid ? getTitle(parsedDate, props.locale) : 'Date unavailable'}
      >
        {valid ? distanceInWords(Date.now(), parsedDate, dateConfig) : 'some time ago'}
      </span>
    )
  },
})
