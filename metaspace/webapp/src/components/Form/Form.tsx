import { defineComponent } from '@vue/composition-api'

export const PrimaryLabelText = defineComponent({
  setup(_, { slots }) {
    return () => (
      <span class="text-base font-medium">
        {slots.default()}
      </span>
    )
  },
})

export const SecondaryLabelText = defineComponent({
  setup(_, { slots }) {
    return () => (
      <span class="block text-sm text-gray-800">
        {slots.default()}
      </span>
    )
  },
})

export const ErrorLabelText = defineComponent({
  setup(_, { slots }) {
    return () => (
      <span class="block text-sm font-medium text-danger">
        {slots.default()}
      </span>
    )
  },
})
