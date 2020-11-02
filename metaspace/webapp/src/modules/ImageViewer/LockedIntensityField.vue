<template>
  <form
    class="relative"
    spellcheck="false"
    autocomplete="off"
    @submit.prevent="onSubmit"
  >
    <label>
      <span class="sr-only">
        {{ srLabel }}
      </span>
      <input
        v-model="inputText"
        type="text"
        :placeholder="placeholder"
        title="Lock maximum intensity"
        :error="hasError"
      />
    </label>
    <button class="button-reset absolute right-0 w-5 h-5 rounded-sm">
      <ArrowIcon class="sm-icon" />
    </button>
  </form>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'

import ArrowIcon from '../../assets/inline/refactoring-ui/arrow-thin-right-circle.svg'

export default defineComponent({
  components: {
    ArrowIcon,
  },
  props: {
    hasError: Boolean,
    srLabel: String,
    placeholder: String,
    initialValue: String,
  },
  setup(props, { emit }) {
    const inputText = ref(props.initialValue)
    return {
      inputText,
      onSubmit() {
        emit('submit', inputText.value)
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
  @apply
    w-full
    h-6
    border
    border-solid
    text-body
    border-gray-300
    bg-white
    pl-2
    pr-6
    box-border
    rounded-sm
    tracking-wider
    transition-colors
    duration-150
    ease-in-out;
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

.sm-icon {
  @apply w-6 h-6 absolute fill-current text-gray-600;
  top: -2px;
  left: -2px;
}
.sm-icon .secondary {
  display: none;
}

button {
  margin: 2px;
}

button:hover,
button:focus {
  @apply bg-blue-300;
}

button:hover .sm-icon,
button:focus .sm-icon {
  @apply text-blue-800;
}
</style>
