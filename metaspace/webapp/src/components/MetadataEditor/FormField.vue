<template>
  <el-form-item
    class="md-form-field"
    :error="typeof error === 'string' ? error : null"
  >
    <span slot="label" class="field-label">
      <span>{{ name }}</span><span v-if="required" style="color: red">*</span>
      <el-popover trigger="hover" placement="right" v-if="help">
        <component :is="help"></component>
        <i slot="reference" class="el-icon-question field-label-help"></i>
      </el-popover>
    </span>

    <el-autocomplete
      v-if="type === 'autocomplete'"
      class="md-ac"
      :popper-class="wideAutocomplete ? 'md-ac-popper--wide' : ''"
      @input="onInput"
      :value="value"
      :required="required"
      :placeholder="placeholder"
      :trigger-on-focus="true"
      :fetch-suggestions="fetchSuggestionsAndTestWidth"
    />

    <el-input
      v-else-if="type === 'textarea'"
      type="textarea"
      @input="onInput"
      :value="value"
      :required="required"
      :placeholder="placeholder"
    />

    <el-input
      v-else-if="type === 'text'"
      @input="onInput"
      :value="value"
      :required="required"
      :placeholder="placeholder"
    />

    <el-select
      v-else-if="type === 'select'"
      @input="onInput"
      :value="value"
      :required="required">
      <el-option v-for="opt in options" :value="opt" :label="opt" :key="opt" />
    </el-select>


    <el-select
      v-else-if="type === 'selectMulti'"
      @input="onInput"
      :value="value"
      :required="required"
      multiple>
      <el-option v-for="opt in options" :value="opt" :label="opt" :key="opt" />
    </el-select>

    <table-input
      v-else-if="type === 'table'"
      @input="onInput"
      :value="value"
      :fields="fields"
      :required="required"
      :placeholder="placeholder"
    />

    <person-input
      v-else-if="type === 'person'"
      @input="onInput"
      :value="value"
      :error="typeof error !== 'string' ? error : null"
      :disableEmail="name === 'Submitter' /* FIXME: Remove this */"
      :required="required"
      :fetchSuggestions="fetchSuggestions"
    />

    <detector-resolving-power-input
      v-else-if="type === 'detectorResolvingPower'"
      @input="onInput"
      :value="value"
      :error="typeof error !== 'string' ? error : null"
      :required="required"
    />

    <div v-else style="color: red">Unrecognized form field type: {{type}}</div>

  </el-form-item>

</template>

<script lang="ts">
  import Vue from 'vue';
  import TableInput from './TableInput.vue';
  import PersonInput from './PersonInput.vue';
  import DetectorResolvingPowerInput from './DetectorResolvingPowerInput.vue';
  import { Component, Prop } from 'vue-property-decorator';
  import { FetchSuggestions, FetchSuggestionsCallback } from 'element-ui/types/autocomplete';

  @Component({
    components: {
      TableInput,
      PersonInput,
      DetectorResolvingPowerInput,
    }
  })
  export default class FormField extends Vue {
    @Prop({ type: String, required: true })
    type!: string;
    @Prop({ type: String, required: true })
    name!: string;
    @Prop()
    help?: any;
    @Prop({ required: true, type: [String, Number, Boolean, Object, Array] })
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
    padding: 0 5px 10px 5px;
    margin-bottom: 0;

    .el-form-item__content {
      line-height: normal;
    }

    .el-form-item__error {
      position: static;
    }

    > .el-form-item__label {
      padding: 0;
      font-size: 16px;
      line-height: 16px;
    }
  }

  .md-ac {
    width: 100%;
  }

  .md-ac-popper--wide {
    min-width: 400px;
  }

  .field-label-help {
    cursor: pointer;
  }

  .subfield {
    padding-right: 10px;
  }

  .subfield-label {
    font-size: 14px;
    padding: 0 0 5px 5px;
  }

  .error-msg {
    font-size: 12px;
    color: red;
  }

</style>
