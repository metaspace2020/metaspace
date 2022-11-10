import './NewFeatureBadge.css'

import Vue from 'vue'
import { defineComponent, reactive } from '@vue/composition-api'

import { getLocalStorage, setLocalStorage } from '../../lib/localStorage'

const storageKey = 'new_feature_badges'

const store: { [key: string]: boolean } = reactive(
  getLocalStorage(storageKey) || {},
)

export function hideFeatureBadge(featureKey: string) {
  if (store[featureKey]) {
    return
  }
  Vue.set(store, featureKey, true)
  setLocalStorage(storageKey, store)
}

const NewFeatureBadge = defineComponent({
  name: 'NewFeatureBadge',
  props: {
    featureKey: { type: String, required: true },
    showUntil: Date as any as () => Date,
  },
  setup(props, { slots }) {
    const isStale = props.showUntil && props.showUntil.valueOf() < Date.now()
    if (!(props.featureKey in store)) {
      Vue.set(store, props.featureKey, false)
    }
    if (store[props.featureKey] || isStale) {
      return () => slots.default()
    }
    return () => (
      <el-badge
        value="New"
        class={['sm-feature-badge', { 'sm-feature-badge--hidden': store[props.featureKey] }]}
      >
        {slots.default()}
      </el-badge>
    )
  },
})

export default NewFeatureBadge
