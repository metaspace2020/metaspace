import { createComponent } from '@vue/composition-api'

export const TagFilterOuter = createComponent({
  setup(_, { slots }) {
    return () => (
      <div class="tf-outer border-gray-300 border border-solid text-sm pr-3">
        {slots.default()}
      </div>
    )
  },
})

export const TagFilterName = createComponent({
  setup(_, { slots }) {
    return () => (
      <div class="tf-name bg-gray-100 text-gray-700 tracking-tight px-3 border-0 border-r border-solid border-gray-300">
        {slots.default()}
      </div>
    )
  },
})

export const TagFilterRemove = createComponent({
  setup(_, { listeners }) {
    return () => (
      <button
        title="Remove filter"
        class="tf-remove button-reset el-icon-close ml-3 text-gray-700 text-base"
        onClick={listeners.click}
      />
    )
  },
})
