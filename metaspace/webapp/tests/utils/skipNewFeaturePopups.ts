import Vue, { CreateElement, VNode } from 'vue'

const name = 'new-feature-popup'

Vue.component(name, {
  name,
  inheritAttrs: false,
  render(h: CreateElement): VNode {
    if (this.$slots && this.$slots.reference) {
      return this.$slots.reference[0]
    }
    return h()
  },
})
