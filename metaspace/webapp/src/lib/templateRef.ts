import Vue from 'vue'
import { onMounted, onUpdated, ref } from '@vue/composition-api'

/**
 * Returns a ref() that is synchronized with Vue.$refs[name].
 *
 * This exists as a workaround to vue 2 not supporting reactive refs as template refs,
 * and the babel-preset-vca-jsx plugin not reliably converting them to string refs.
 *
 * Related bug: https://github.com/luwanquan/babel-preset-vca-jsx/issues/6
 *
 * Usage:
 * const myEl = templateRef('someStringConstant')
 * const myElWidth = computed(() => myEl.value && myEl.value.clientWidth)
 *
 * render() {
 *   return <div ref="someStringConstant">
 * }
 */
export const templateRef = <T extends Vue | Element | null = any>(name: string) => {
  const r = ref<T>(null)
  onMounted(function(this: Vue) { r.value = this.$refs[name] as T })
  onUpdated(function(this: Vue) { r.value = this.$refs[name] as T })
  return r
}
