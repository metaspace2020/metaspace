<template>
  <form
    class="relative"
    spellcheck="false"
    autocomplete="off"
    @submit.prevent="onSubmit"
  >
    <label>
      <span class="sr-only">
        {{ label }}
      </span>
      <input
        ref="inputRef"
        v-model="inputText"
        type="text"
        :title="label"
        :placeholder="placeholder"
        :error="hasError"
      />
    </label>
    <fade-transition class="button-reset absolute top-0 right-0 w-5 h-5 rounded-sm">
      <button
        v-if="inputText !== storedValue"
        key="submit"
        type="submit"
      >
        <ArrowIcon />
      </button>
      <button
        v-else-if="inputText.length"
        key="clear"
        type="text"
        @click="inputText = '';"
      >
        <CloseIcon />
      </button>
    </fade-transition>
  </form>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'

import FadeTransition from '../../components/FadeTransition'
import ArrowIcon from '../../assets/inline/refactoring-ui/arrow-thin-right-circle.svg'
import CloseIcon from '../../assets/inline/refactoring-ui/close.svg'

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
    storedValue: String,
  },
  setup(props, { emit }) {
    const inputText = ref(props.storedValue)
    const inputRef = ref<HTMLInputElement>(null)
    return {
      inputText,
      inputRef,
      onSubmit() {
        emit('submit', inputText.value)
        if (inputRef.value) inputRef.value.focus()
      },
    }
  },
})
</script>
<style scoped>
form {
  width: calc(50% - 6px);
}

input {
  @apply w-full h-6 pl-2 pr-6 box-border border border-solid text-body border-gray-300 bg-white rounded-sm
    tracking-wider transition-colors duration-150 ease-in-out;
  outline: none;
}
input::placeholder {
  @apply text-gray-600;
}
input:hover {
  @apply border-gray-500;
}
input:focus {
  @apply border-primary;
}
input[error] {
  @apply border-danger;
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
