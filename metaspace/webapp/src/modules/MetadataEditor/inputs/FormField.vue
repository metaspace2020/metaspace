<template>
  <el-form-item
    class="md-form-field"
    :error="typeof error === 'string' ? error : null"
  >
    <span slot="label" class="field-label">
      <span>{{ name }}</span><span v-if="required" style="color: red">*</span>
      <el-popover trigger="hover" placement="right" v-if="help">
        <component :is="help"></component>
        <i slot="reference" class="el-icon-question metadata-help-icon"></i>
      </el-popover>
    </span>

    <el-autocomplete
      v-if="type === 'autocomplete'"
      class="md-ac"
      :popper-class="wideAutocomplete ? 'md-ac-popper--wide' : ''"
      @input="onInput"
      @select="onSelect"
      :value="value"
      :required="required"
      :placeholder="placeholder"
      :trigger-on-focus="true"
      :fetch-suggestions="fetchSuggestionsAndTestWidth"
      v-bind="$attrs"
    />

    <el-input
      v-else-if="type === 'textarea'"
      :autosize="{minRows: 1.5, maxRows: 5}"
      type="textarea"
      @input="onInput"
      :value="value"
      :required="required"
      :placeholder="placeholder"
      v-bind="$attrs"
    />

    <el-input
      v-else-if="type === 'text'"
      @input="onInput"
      :value="value"
      :required="required"
      :placeholder="placeholder"
      v-bind="$attrs"
    />

    <el-select
      v-else-if="type === 'select'"
      @input="onInput"
      :value="value"
      :required="required"
      v-bind="$attrs">
      <el-option v-for="opt in options"
                 :value="optionsAreStrings ? opt : opt.value"
                 :label="optionsAreStrings ? opt : opt.label"
                 :key="optionsAreStrings ? opt : opt.value" />
    </el-select>

    <el-select
      v-else-if="type === 'selectMulti'"
      @input="onInput"
      :value="value"
      :required="required"
      multiple
      v-bind="$attrs">
      <el-option v-for="opt in options"
                 :value="optionsAreStrings ? opt : opt.value"
                 :label="optionsAreStrings ? opt : opt.label"
                 :key="optionsAreStrings ? opt : opt.value" />
    </el-select>

    <table-input
      v-else-if="type === 'table'"
      @input="onInput"
      :value="value"
      :fields="fields"
      :required="required"
      :placeholder="placeholder"
      v-bind="$attrs"
    />

    <person-input
      v-else-if="type === 'person'"
      @input="onInput"
      :value="value"
      :error="typeof error !== 'string' ? error : null"
      :required="required"
      :fetchSuggestions="fetchSuggestions"
      v-bind="$attrs"
    />

    <detector-resolving-power-input
      v-else-if="type === 'detectorResolvingPower'"
      @input="onInput"
      :value="value"
      :error="typeof error !== 'string' ? error : null"
      :required="required"
      v-bind="$attrs"
    />

    <pixel-size-input
      v-else-if="type === 'pixelSize'"
      @input="onInput"
      :value="value"
      :error="typeof error !== 'string' ? error : null"
      :required="required"
      v-bind="$attrs"
    />

    <div v-else style="color: red">Unrecognized form field type: {{type}}</div>

  </el-form-item>

</template>

<script lang="ts">
  import Vue from 'vue';
  import TableInput from './TableInput.vue';
  import PersonInput from './PersonInput.vue';
  import DetectorResolvingPowerInput from './DetectorResolvingPowerInput.vue';
  import PixelSizeInput from './PixelSizeInput.vue';
  import { Component, Prop } from 'vue-property-decorator';
  import { FetchSuggestions, FetchSuggestionsCallback } from 'element-ui/types/autocomplete';

  @Component({
    inheritAttrs: false,
    components: {
      TableInput,
      PersonInput,
      DetectorResolvingPowerInput,
      PixelSizeInput
    }
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

    get optionsAreStrings() {
      return this.options && this.options.length > 0 && typeof this.options[0] === 'string';
    }

    onSelect(val: any) {
      this.$emit('select', val);
    }

    onInput(val: any) {
      this.$emit('input', val);
    }

    fetchSuggestionsAndTestWidth(queryString: string, callback: FetchSuggestionsCallback) {
      const CHARS_BREAKPOINT = 26;
      this.fetchSuggestions(queryString, results => {
        this.wideAutocomplete = Array.isArray(results)
          && results.some(result => result && result.value && result.value.length && result.value.length >= CHARS_BREAKPOINT);
        callback(results);
      })
    }
  }
</script>

<style lang="scss">
  .md-form-field {
    padding: 5px 5px 8px 5px;
    margin-bottom: 0;

    .el-form-item__content {
      line-height: normal;
    }

    .el-form-item__error {
      position: absolute;
    }

    > .el-form-item__label {
      padding: 0;
      margin-bottom: 2px;
      font-size: 14px;
      line-height: 16px;
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
