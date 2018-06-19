<template>
  <div class="metadata-section">
    <div class="heading">{{section.title}}</div>

    <el-form size="medium"
             label-position="top">
      <el-col v-for="(field, fieldKey) in section.properties"
              :span="field.smEditorColWidth"
              :key="fieldKey">

        <form-field
          :type="field.smEditorType"
          :name="field.title"
          :help="field.smEditorHelp"
          @input="val => onInput([sectionKey, fieldKey], val)"
          :value="value[fieldKey]"
          :error="error && error[fieldKey]"
          :fields="field.items && field.items.properties"
          :options="field.enum || (field.items && field.items.enum)"
          :required="section.required && section.required.includes(fieldKey)"
          :placeholder="field.description"
          :fetchSuggestions="fetchSuggestionsFunc(fieldKey)"
        />
      </el-col>
    </el-form>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import { FetchSuggestionsCallback } from 'element-ui/types/autocomplete'
  import { memoize } from 'lodash-es'
  import { FormSectionProperty } from './formStructure'
  import FormField from './FormField.vue';

  @Component({
    components: {
      FormField
    },
  })
  export default class FormSection extends Vue {
    @Prop({type: String, required: true})
    sectionKey!: string;
    @Prop({type: Object, required: true})
    section!: FormSectionProperty;
    @Prop({type: Object, required: true})
    value!: Record<string, any>;
    @Prop({type: Object })
    error?: Record<string, any>;
    @Prop(Function)
    getSuggestionsForField!: (q: string, cb: FetchSuggestionsCallback, ...path: string[]) => void;

    onInput(path: string[], val: string) {
      this.$emit('input', path, val);
    }

    // This function is memoized to prevent unnecessary updates in form fields
    fetchSuggestionsFunc = memoize((fieldKey: string) => {
      return (q: string, cb: FetchSuggestionsCallback) => {
        this.getSuggestionsForField(q, cb, this.sectionKey, fieldKey);
      }
    })
  }
</script>

<style lang="scss">
  .metadata-section {
    display: block;
    max-width: 1000px;
    > .heading {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }
  }
</style>
