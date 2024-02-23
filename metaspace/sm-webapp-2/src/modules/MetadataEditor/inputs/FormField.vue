<template>
  <el-form-item class="md-form-field" :error="typeof error === 'string' ? error : null">
    <template v-slot:label>
      <span class="field-label flex items-center">
        <span>{{ name }}</span
        ><span v-if="required" style="color: red">*</span>
        <el-popover v-if="help" trigger="hover" placement="right">
          <component :is="help" />
          <template #reference>
            <el-icon class="metadata-help-icon"><QuestionFilled /></el-icon>
          </template>
        </el-popover>
      </span>
    </template>

    <el-autocomplete
      v-if="type === 'autocomplete'"
      class="md-ac"
      :popper-class="wideAutocomplete ? 'md-ac-popper--wide' : ''"
      :model-value="value"
      :required="required"
      :placeholder="placeholder"
      :trigger-on-focus="true"
      :fetch-suggestions="fetchSuggestionsAndTestWidth"
      v-bind="$attrs"
      @input="onInput"
      @select="onSelect"
    />

    <el-input
      v-else-if="type === 'textarea'"
      :autosize="{ minRows: 1.5, maxRows: 5 }"
      type="textarea"
      :model-value="value"
      :required="required"
      :placeholder="placeholder"
      v-bind="$attrs"
      @input="onInput"
    />

    <el-input
      v-else-if="type === 'text'"
      :model-value="value"
      :required="required"
      :placeholder="placeholder"
      v-bind="$attrs"
      @input="onInput"
    />

    <custom-number-input
      v-else-if="type === 'number'"
      :value="value"
      :required="required"
      :placeholder="placeholder"
      v-bind="$attrs"
      @input="onInput"
    />

    <el-select
      v-else-if="type === 'select'"
      :model-value="value"
      :required="required"
      v-bind="$attrs"
      @change="onInput"
    >
      <el-option
        v-for="opt in options"
        :key="optionsAreStrings ? opt : opt.value"
        :value="optionsAreStrings ? opt : opt.value"
        :label="optionsAreStrings ? opt : opt.label"
      />
    </el-select>

    <el-select
      v-else-if="type === 'selectMulti'"
      :model-value="value"
      :required="required"
      multiple
      v-bind="$attrs"
      @remove-tag="onRemoveTag"
      @change="onInput"
    >
      <slot name="options">
        <el-option
          v-for="opt in options"
          :key="optionsAreStrings ? opt : opt.value"
          :value="optionsAreStrings ? opt : opt.value"
          :label="optionsAreStrings ? opt : opt.label"
        />
      </slot>
    </el-select>

    <el-select
      v-else-if="type === 'selectMultiWithCreate'"
      popper-class="el-select-popper__with-create"
      no-data-text="Invalid value"
      :model-value="value"
      :required="required"
      multiple
      filterable
      default-first-option
      remote
      :remote-method="onCreateItemInput"
      :loading="false"
      v-bind="$attrs"
      @remove-tag="onRemoveTag"
      @change="onInput"
    >
      <slot name="options">
        <el-option
          v-for="opt in createItemPreviewOptions"
          :key="createOptionsAreStrings ? opt : opt.value"
          :value="createOptionsAreStrings ? opt : opt.value"
          :label="createOptionsAreStrings ? opt : opt.label"
        />
      </slot>
    </el-select>

    <table-input
      v-else-if="type === 'table'"
      :value="value"
      :fields="fields"
      :required="required"
      :placeholder="placeholder"
      v-bind="$attrs"
      @input="onInput"
    />

    <person-input
      v-else-if="type === 'person'"
      :value="value"
      :error="typeof error !== 'string' ? error : null"
      :required="required"
      :fetch-suggestions="fetchSuggestions"
      :debounce="0"
      v-bind="$attrs"
      @input="onInput"
    />

    <detector-resolving-power-input
      v-else-if="type === 'detectorResolvingPower'"
      :value="value"
      :error="typeof error !== 'string' ? error : null"
      :required="required"
      v-bind="$attrs"
      @input="onInput"
    />

    <pixel-size-input
      v-else-if="type === 'pixelSize'"
      :value="value"
      :error="typeof error !== 'string' ? error : null"
      :required="required"
      v-bind="$attrs"
      @input="onInput"
    />

    <el-switch
      v-else-if="type === 'switch'"
      :model-value="value"
      :error="typeof error !== 'string' ? error : null"
      :required="required"
      v-bind="$attrs"
      @input="onInput"
    />

    <div v-else style="color: red">Unrecognized form field type: {{ type }}</div>
  </el-form-item>
</template>

<script lang="ts">
import { defineComponent, PropType, ref, computed } from 'vue'
import TableInput from './TableInput.vue'
import PersonInput from './PersonInput.vue'
import DetectorResolvingPowerInput from './DetectorResolvingPowerInput.vue'
import PixelSizeInput from './PixelSizeInput.vue'
import CustomNumberInput from './CustomNumberInput.vue'
import { uniq } from 'lodash-es'
import { QuestionFilled } from '@element-plus/icons-vue'
import {
  ElIcon,
  ElAutocomplete,
  ElPopover,
  ElSelect,
  ElFormItem,
  ElInput,
  ElOption,
  ElSwitch,
} from '../../../lib/element-plus'

export default defineComponent({
  name: 'FormField',
  components: {
    TableInput,
    PersonInput,
    DetectorResolvingPowerInput,
    PixelSizeInput,
    CustomNumberInput,
    QuestionFilled,
    ElIcon,
    ElAutocomplete,
    ElPopover,
    ElSwitch,
    ElSelect,
    ElFormItem,
    ElInput,
    ElOption,
  },
  props: {
    type: { type: String as PropType<string>, required: true },
    name: { type: String as PropType<string>, required: true },
    help: { type: Object as PropType<any> },
    value: { type: [String, Object, Array, Number, Boolean] as PropType<any>, default: null },
    error: { type: [String, Object, Array] as PropType<any> },
    fields: { type: Object as PropType<any> },
    options: { type: Array as PropType<any[]> },
    required: { type: Boolean, default: false },
    placeholder: { type: String as PropType<string> },
    fetchSuggestions: { type: Function as any },
    normalizeInput: { type: Function as PropType<(value: string) => string | null> },
  },
  emits: ['input', 'select', 'remove-tag'],
  setup(props, { emit }) {
    const wideAutocomplete = ref(false)
    const createItemPreviewOptions = ref([])

    const optionsAreStrings = computed(
      () => props.options && props.options.length > 0 && typeof props.options[0] === 'string'
    )
    const createOptionsAreStrings = computed(
      () => createItemPreviewOptions.value.length > 0 && typeof createItemPreviewOptions.value[0] === 'string'
    )

    const onSelect = (val: any) => {
      emit('select', val)
    }

    const onInput = (val: any) => {
      if (props.type === 'selectMultiWithCreate') {
        const valArray = val as string[]
        const normalizedVals = valArray.flatMap((newVal) => {
          if (valArray.includes(newVal) || !props.normalizeInput) {
            // Don't change existing values, don't normalize if no normalization function
            return [newVal]
          }
          const normalizedVal = props.normalizeInput(newVal)
          return normalizedVal != null ? [normalizedVal] : []
        })
        emit('input', uniq(normalizedVals))
      } else {
        emit('input', val)
      }
    }

    const onRemoveTag = (val: any) => {
      emit('remove-tag', val)
    }

    const onCreateItemInput = (val: any) => {
      // WORKAROUND: This uses ElSelect's remote search interface to show the validated, normalized form of the
      // user's input. If the input is null after normalization, the options list is empty and
      // ElSelect shows the no-data-text instead.
      const normalizedVal = props.normalizeInput != null ? props.normalizeInput(val) : val
      createItemPreviewOptions.value = normalizedVal != null ? [normalizedVal] : []
    }

    const fetchSuggestionsAndTestWidth = (queryString: string, callback: any) => {
      const CHARS_BREAKPOINT = 26
      props.fetchSuggestions(queryString, (results) => {
        wideAutocomplete.value =
          Array.isArray(results) &&
          results.some(
            (result) => result && result.value && result.value.length && result.value.length >= CHARS_BREAKPOINT
          )
        callback(results)
      })
    }

    return {
      wideAutocomplete,
      createItemPreviewOptions,
      optionsAreStrings,
      createOptionsAreStrings,
      onSelect,
      onInput,
      onRemoveTag,
      onCreateItemInput,
      fetchSuggestionsAndTestWidth,
    }
  },
})
</script>

<style lang="scss">
.md-form-field {
  padding: 0 5px 10px;
  margin-bottom: 0;

  .el-form-item__content {
    line-height: normal;
  }

  .el-form-item__error {
    position: absolute;
  }

  > .el-form-item__label {
    padding: 0;
    font-size: 14px;
    line-height: 24px;
  }

  .el-select {
    width: 100%;
  }
}

.md-ac {
  width: 100%;
}

.md-ac-popper--wide {
  min-width: 400px;
}

.subfield {
  padding-right: 20px;
}

.subfield-label {
  @apply text-gray-600;
  font-size: 13px;
  padding: 2px 0 5px 5px;
}

.error-msg {
  font-size: 12px;
  color: red;
}

.el-input__inner {
  width: 100%;
}

.el-select-popper__with-create .el-select-dropdown__list::after {
  @apply pt-2 px-5 text-center;
  display: list-item;
  content: 'Press enter to confirm';
  // Style to match the no-data-text
  font-size: 14px;
  color: #999;
}
</style>
