<template>
  <tag-filter :name="name" :removable="removable" @show="show" @destroy="destroy">
    <template v-slot:edit>
      <el-input ref="inputRef" v-model="localValue" type="text" @input="onChange" />
    </template>
    <template v-slot:show>
      <span class="tf-value-span">
        <span v-if="value">{{ value }}</span>
        <span v-else class="inline-block w-4" />
      </span>
    </template>
  </tag-filter>
</template>

<script>
import { defineComponent, ref, watch } from 'vue'
import { debounce } from 'lodash-es'
import TagFilter from './TagFilter.vue'
import { ElInput } from 'element-plus'

export default defineComponent({
  name: 'InputFilter',
  components: {
    TagFilter,
    ElInput,
  },
  props: {
    name: String,
    value: [String, Number],
    removable: { type: Boolean, default: true },
    mode: { type: String, default: 'text' },
    debounce: Boolean,
  },
  setup(props, { emit }) {
    const localValue = ref(props.value)
    const inputRef = ref(null)

    const onChange = (val) => {
      emit('input', val)
      emit('change', val)
    }
    const debouncedOnChange = props.debounce ? debounce(onChange, 500) : onChange

    const destroy = () => {
      emit('destroy', props.name)
    }

    const show = () => {
      const inputElement = inputRef.value?.$refs.input
      if (inputElement) {
        inputElement.focus()
      }
    }

    watch(
      () => props.value,
      (newValue) => {
        localValue.value = newValue
      }
    )

    return {
      localValue,
      inputRef,
      onChange: debouncedOnChange,
      destroy,
      show,
    }
  },
})
</script>
