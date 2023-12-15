import {nextTick, onMounted} from 'vue'

const headerHeight = 64

/*
  Use this on the page containing the target id.
  It should scroll to the anchor tag in a new tab / direct navigation.
*/
export default () => {
  onMounted(async () => {
    if (location.hash) {
      await nextTick() // allows page to render
      const el = document.querySelector(location.hash) as HTMLElement
      if (el) {
        await nextTick() // allows initial reset of scroll position
        window.scrollTo(0, el.offsetTop - headerHeight)
      }
    }
  })
}
