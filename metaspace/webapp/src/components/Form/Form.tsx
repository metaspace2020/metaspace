import { createComponent } from '@vue/composition-api'

export const PrimaryLabelText = createComponent({
  setup(_, { slots }) {
    return () => (
      <span class="text-base font-medium">
        {slots.default()}
      </span>
    )
  },
})

export const SecondaryLabelText = createComponent({
  setup(_, { slots }) {
    return () => (
      <span class="block text-sm text-gray-800">
        {slots.default()}
      </span>
    )
  },
})

export const ErrorLabelText = createComponent({
  setup(_, { slots }) {
    return () => (
      <span class="block text-sm font-medium text-danger">
        {slots.default()}
      </span>
    )
  },
})
