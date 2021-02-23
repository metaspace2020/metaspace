import Vue from 'vue'
import { onMounted } from '@vue/composition-api'

const headerHeight = 64

/*
  Use this on the page containing the target id.
  It should scroll to the anchor tag in a new tab / direct navigation.
*/
export default () => {
  onMounted(() => {
    if (location.hash) {
      Vue.nextTick(() => { // allows page to render
        const el = document.querySelector(location.hash) as HTMLElement
        if (el) {
          Vue.nextTick(() => { // allows initial reset of scroll position
            window.scrollTo(0, el.offsetTop - headerHeight)
          })
        }
      })
    }
  })
}
