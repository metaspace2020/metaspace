<template>
  <tag-filter :name="name" :removable="removable" :width="256" @show="show" @destroy="destroy">
    <template #edit>
      <el-input
        v-if="rawInput"
        ref="inputRef"
        v-model="localValue"
        :step="step"
        :max="max"
        :min="min"
        class="w-full"
        controls-position="right"
        @change="onChange"
      />
      <el-input-number
        v-else
        ref="inputRef"
        :value="localValue"
        :step="step"
        :max="max"
        :min="min"
        class="w-full"
        controls-position="right"
        @change="onChange"
      />
      <filter-help-text> Press <span class="font-medium">Enter</span> to confirm manual input </filter-help-text>
    </template>
    <template #show>
      <span v-if="value" class="tf-value-span">{{ value }}</span>
      <span v-else class="inline-block w-4 tf-value-span"></span>
      <slot />
    </template>
  </tag-filter>
</template>

<script>
import { defineComponent, ref, watch, nextTick } from 'vue'
import TagFilter from './TagFilter.vue'
import { FilterHelpText } from './TagFilterComponents'
import { ElInputNumber, ElInput } from 'element-plus'

export default defineComponent({
  name: 'NumberFilter',
  components: {
    TagFilter,
    FilterHelpText,
    ElInputNumber,
    ElInput,
  },
  props: {
    name: String,
    value: [String, Number],
    removable: { type: Boolean, default: true },
    min: Number,
    max: Number,
    maxlength: String,
    step: Number,
    rawInput: { type: Boolean, default: false },
  },
  setup(props, { emit }) {
    const localValue = ref(props.rawInput ? props.value : Number(props.value) || 0)
    const inputRef = ref(null)

    watch(
      () => props.value,
      (newValue) => {
        localValue.value = props.rawInput ? newValue : Number(newValue) || 0
      }
    )

    const onChange = (val) => {
      if (props.rawInput) {
        val = val.replace(/[^.\d]/g, '').replace(/^(\d*\.?)|(\d*)\.?/g, '$1$2')
      }
      const v = val === undefined ? 0 : val
      emit('input', v)
      emit('change', v)
    }

    const destroy = () => {
      emit('destroy', props.name)
    }

    const show = () => {
      nextTick(() => {
        if (inputRef.value) {
          const inputElement = inputRef.value.$refs.input
          inputElement.focus()
        }
      })
    }

    return {
      localValue,
      inputRef,
      onChange,
      destroy,
      show,
    }
  },
})
</script>
