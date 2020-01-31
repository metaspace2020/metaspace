<template>
  <div class="metadata-section">
    <el-form
      size="medium"
      label-position="top"
    >
      <el-col :span="6">
        <div class="metadata-section__title">
          {{ section.title }}
          <el-popover
            v-if="section.help"
            trigger="hover"
            placement="top"
          >
            <p>{{ section.help }}</p>
            <i
              slot="reference"
              class="el-icon-question metadata-help-icon"
            />
          </el-popover>
        </div>
      </el-col>
      <el-col :span="18">
        <el-row :gutter="8">
          <el-col
            v-for="(field, fieldKey) in section.properties"
            :key="fieldKey"
            :span="field.smEditorColWidth"
          >
            <form-field
              :type="field.smEditorType"
              :name="field.title"
              :help="field.smEditorHelp"
              :value="value[fieldKey]"
              :error="error && error[fieldKey]"
              :fields="field.items && field.items.properties"
              :options="field.enum || (field.items && field.items.enum)"
              :required="section.required && section.required.includes(fieldKey)"
              :placeholder="field.description"
              :fetch-suggestions="fetchSuggestionsFunc(fieldKey)"
              @input="val => onInput([sectionKey, fieldKey], val)"
            />
          </el-col>
        </el-row>
      </el-col>
    </el-form>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { FetchSuggestionsCallback } from 'element-ui/types/autocomplete'
import { memoize } from 'lodash-es'
import { FormSectionProperty } from '../formStructure'
import FormField from '../inputs/FormField.vue'
import './FormSection.scss'

  @Component({
    components: {
      FormField,
    },
  })
export default class FormSection extends Vue {
    @Prop({ type: String, required: true })
    sectionKey!: string;

    @Prop({ type: Object, required: true })
    section!: FormSectionProperty;

    @Prop({ type: Object, required: true })
    value!: Record<string, any>;

    @Prop({ type: Object })
    error?: Record<string, any>;

    @Prop(Function)
    getSuggestionsForField!: (q: string, cb: FetchSuggestionsCallback, ...path: string[]) => void;

    onInput(path: string[], val: string) {
      this.$emit('input', path, val)
    }

    // This function is memoized to prevent unnecessary updates in form fields
    fetchSuggestionsFunc = memoize((fieldKey: string) => {
      return (q: string, cb: FetchSuggestionsCallback) => {
        this.getSuggestionsForField(q, cb, this.sectionKey, fieldKey)
      }
    })
}
</script>

<style lang="scss">
  //@import './FormSection.scss'; // Imported in JS so that Webpack de-duplicates redundant copies
</style>
