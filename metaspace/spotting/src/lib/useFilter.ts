import { computed, ref, watch } from '@vue/composition-api'
import { FilterKey } from '../modules/Filters/filterSpecs'

/**
 * Returns a property for getting/setting a specific filter from $store.getters.filter.
 * @param $store
 * @param filterName
 */
export default ($store: any, filterName: FilterKey) => {
  // For some reason, whenever $store.getters.filter is recalculated, ALL downstream watchers are triggered,
  // even if they only depend on a computed property that extracted an unchanged value from inside the filters.
  // This causes a lot of unnecessary re-rendering.
  // Proxying the value through a ref seems to stop unnecessarily triggering watchers when the value hasn't changed.
  const filter = ref($store.getters.filter[filterName])

  watch(() => $store.getters.filter, () => {
    filter.value = $store.getters.filter[filterName]
  })

  return computed({
    get: () => filter.value,
    set: (value: any) => {
      $store.commit('updateFilter', {
        ...$store.getters.filter,
        [filterName]: value,
      })
    },
  })
}
