<template>
  <el-form-item
    class="md-form-field"
    :error="typeof error === 'string' ? error : null"
  >
    <span
      slot="label"
      class="field-label"
    >
      <span>{{ name }}</span><span
        v-if="required"
        style="color: red"
      >*</span>
      <el-popover
        v-if="help"
        trigger="hover"
        placement="right"
      >
        <component :is="help" />
        <i
          slot="reference"
          class="el-icon-question metadata-help-icon"
        />
      </el-popover>
    </span>

    <el-autocomplete
      v-if="type === 'autocomplete'"
      class="md-ac"
      :popper-class="wideAutocomplete ? 'md-ac-popper--wide' : ''"
      :value="value"
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
      :autosize="{minRows: 1.5, maxRows: 5}"
      type="textarea"
      :value="value"
      :required="required"
      :placeholder="placeholder"
      v-bind="$attrs"
      @input="onInput"
    />

    <el-input
      v-else-if="type === 'text'"
      :value="value"
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
      :value="value"
      :required="required"
      v-bind="$attrs"
      @input="onInput"
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
      :value="value"
      :required="required"
      multiple
      v-bind="$attrs"
      @input="onInput"
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

    <div
      v-else
      style="color: red"
    >
      Unrecognized form field type: {{ type }}
    </div>
  </el-form-item>
</template>

<script lang="ts">
import Vue from 'vue'
import TableInput from './TableInput.vue'
import PersonInput from './PersonInput.vue'
import DetectorResolvingPowerInput from './DetectorResolvingPowerInput.vue'
import PixelSizeInput from './PixelSizeInput.vue'
import { Component, Prop } from 'vue-property-decorator'
import { FetchSuggestions, FetchSuggestionsCallback } from 'element-ui/types/autocomplete'
import CustomNumberInput from './CustomNumberInput.vue'
import { throttle } from 'lodash-es'

  @Component({
    inheritAttrs: false,
    components: {
      TableInput,
      PersonInput,
      DetectorResolvingPowerInput,
      PixelSizeInput,
      CustomNumberInput,
    },
  })
export default class FormField extends Vue {
    @Prop({ type: String, required: true })
    type!: string;

    @Prop({ type: String, required: true })
    name!: string;

    @Prop()
    help?: any;

    @Prop({ validator: val => val !== undefined })
    value!: any;

    @Prop([String, Object, Array])
    error?: string | object | any[];

    @Prop(Object)
    fields?: object;

    @Prop(Array)
    options?: any[];

    @Prop({ type: Boolean, default: false })
    required!: Boolean;

    @Prop(String)
    placeholder?: String;

    @Prop(Function)
    fetchSuggestions!: FetchSuggestions;

    wideAutocomplete = false;

    created() {
      // WORKAROUND: Currently there's a delay that causes the autocomplete box to stutter when opening on focus.
      // Fix PR: https://github.com/ElemeFE/element/pull/17302
      // The current workaround is to disable debouncing on the component and instead use throttle here so that
      // the first call happens without delay
      this.fetchSuggestionsAndTestWidth = throttle(this.fetchSuggestionsAndTestWidth)
    }

    get optionsAreStrings() {
      return this.options && this.options.length > 0 && typeof this.options[0] === 'string'
    }

    onSelect(val: any) {
      this.$emit('select', val)
    }

    onInput(val: any) {
      this.$emit('input', val)
    }

    fetchSuggestionsAndTestWidth(queryString: string, callback: FetchSuggestionsCallback) {
      const CHARS_BREAKPOINT = 26
      this.fetchSuggestions(queryString, results => {
        this.wideAutocomplete = Array.isArray(results)
          && results.some(result => result
            && result.value
            && result.value.length
            && result.value.length >= CHARS_BREAKPOINT)
        callback(results)
      })
    }
}
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
</style>
