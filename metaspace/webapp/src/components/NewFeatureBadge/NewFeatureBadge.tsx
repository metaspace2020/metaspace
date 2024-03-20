import { reactive, ref } from 'vue'
import { ElBadge } from '../../lib/element-plus'
import { defineComponent } from 'vue'
// Import the CSS as needed
import './NewFeatureBadge.css'

// Assuming getLocalStorage and setLocalStorage are compatible with Vue 3
import { getLocalStorage, setLocalStorage } from '../../lib/localStorage'

const storageKey = 'new_feature_badges'

const store = reactive<any>(getLocalStorage(storageKey) || {})

export function hideFeatureBadge(featureKey) {
  if (store[featureKey]) {
    return
  }
  store[featureKey] = true
  setLocalStorage(storageKey, store)
}

export default defineComponent({
  name: 'NewFeatureBadge',
  components: {
    ElBadge,
  },
  props: {
    customClass: { type: String, default: '' },
    featureKey: { type: String, required: true },
    showUntil: { type: Date, required: false },
  },
  setup(props, { slots }) {
    const isStale = ref(props.showUntil && props.showUntil.valueOf() < Date.now())

    if (!(props.featureKey in store)) {
      store[props.featureKey] = false
    }

    return () => {
      if (store[props.featureKey] || isStale.value) {
        return slots.default ? slots.default() : null
      }
      return (
        <ElBadge
          value="New"
          isDot
          class={['sm-feature-badge', { 'sm-feature-badge--hidden': store[props.featureKey] }, props.customClass]}
        >
          {slots.default ? slots.default() : null}
        </ElBadge>
      )
    }
  },
})
