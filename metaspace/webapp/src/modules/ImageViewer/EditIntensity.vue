<template>
  <form
    ref="containerRef"
    class="relative"
    spellcheck="false"
    autocomplete="off"
    @submit.prevent="submit"
    @click.stop
    @mousedown.stop
    @keyup.stop
  >
    <label>
      <span class="sr-only">
        {{ label }}
      </span>
      <input
        ref="inputRef"
        v-model="inputText"
        :class="[
          'w-full h-6 pl-2 pr-6 box-border border border-solid text-body border-gray-300 bg-white rounded-sm',
          'text-xs tracking-wider transition-colors duration-150 ease-in-out outline-none shadow',
          error ? 'border-danger' : 'focus:border-primary hover:border-gray-500'
        ]"
        type="text"
        :title="label"
        :placeholder="placeholder"
        :error="hasError"
      />
    </label>
    <fade-transition class="button-reset absolute top-0 right-0 w-5 h-5 rounded-sm">
      <button
        v-if="inputText !== initialValue"
        key="submit"
        type="submit"
      >
        <ArrowIcon />
      </button>
      <button
        v-else-if="inputText.length"
        key="clear"
        type="button"
        @click="$emit('reset')"
      >
        <CloseIcon />
      </button>
    </fade-transition>
  </form>
</template>
<script lang="ts">
import { defineComponent, ref, onMounted, onBeforeUnmount } from '@vue/composition-api'

import FadeTransition from '../../components/FadeTransition'
import ArrowIcon from '../../assets/inline/refactoring-ui/icon-arrow-thin-right-circle.svg'
import CloseIcon from '../../assets/inline/refactoring-ui/icon-close.svg'

import useOutClick from '../../lib/useOutClick'

export default defineComponent({
  components: {
    ArrowIcon,
    CloseIcon,
    FadeTransition,
  },
  props: {
    hasError: Boolean,
    label: String,
    placeholder: String,
    initialValue: String,
  },
  setup(props, { emit }) {
    const inputText = ref(props.initialValue || '')
    const inputRef = ref<HTMLInputElement>()
    const error = ref(false)
    const containerRef = ref<HTMLElement>()

    onMounted(() => {
      if (inputRef.value) {
        inputRef.value.focus()
      }
    })

    const removeListeners = useOutClick(() => emit('close'), containerRef)
    onBeforeUnmount(removeListeners)

    return {
      inputText,
      inputRef,
      error,
      containerRef,
      submit() {
        const text = inputText.value
        if (text === props.initialValue) {
          emit('close')
          return
        }
        if (text.length === 0) {
          emit('reset')
          return
        }
        const floatValue = parseFloat(text)
        if (isNaN(floatValue)) {
          error.value = true
        } else {
          emit('submit', floatValue)
        }
      },
    }
  },
})
</script>
<style scoped>
input::placeholder {
  @apply text-gray-600;
}

button {
  margin: 2px;
}

button:hover,
button:focus {
  @apply bg-blue-300;
}

button:hover > svg,
button:focus > svg {
  @apply text-blue-800;
}

button > svg {
  @apply w-6 h-6 absolute fill-current text-gray-600;
  top: -2px;
  left: -2px;
}
button > svg .secondary {
  display: none;
}
</style>
