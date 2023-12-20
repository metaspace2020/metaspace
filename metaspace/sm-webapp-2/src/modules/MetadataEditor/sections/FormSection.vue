<template>
  <div class="metadata-section">
    <el-form
      class="flex"
      size="default"
      label-position="top"
    >
      <el-col :span="6">
        <div class="metadata-section__title">
          {{ section?.title }}
          <el-popover
            v-if="section?.help"
            trigger="hover"
            placement="top"
          >
            <p>{{ section?.help }}</p>
            <template #reference>
              <i
                class="el-icon-question metadata-help-icon"
              />
            </template>
          </el-popover>
        </div>
      </el-col>
      <el-col :span="18">
        <el-row :gutter="8">
          <el-col
            v-for="(field, fieldKey) in section?.properties"
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
              :required="section?.required && section?.required.includes(fieldKey)"
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
import { defineComponent, PropType } from 'vue';
import { memoize } from 'lodash-es';
import FormField from '../inputs/FormField.vue';
import { FormSectionProperty } from '../formStructure';
import {ElCol, ElForm, ElPopover, ElRow} from "element-plus";
import './Formsection.scss';

export default defineComponent({
  name: 'FormSection',
  components: {
    FormField,
    ElCol,
    ElForm,
    ElPopover,
    ElRow,
  },
  props: {
    sectionKey: {
      type: String as PropType<string>,
      required: true
    },
    section: {
      type: Object as PropType<FormSectionProperty>,
      required: true
    },
    value: {
      type: Object as PropType<Record<string, any>>,
      required: true
    },
    error: {
      type: Object as PropType<Record<string, any>>,
      default: () => ({})
    },
    getSuggestionsForField: {
      type: Function as PropType<(q: string, cb: any, ...path: string[]) => void>,
      required: true
    }
  },
  setup(props, { emit }) {
    const fetchSuggestionsFunc = memoize((fieldKey: string) => {
      return (q: string, cb: any) => {
        props.getSuggestionsForField(q, cb, props.sectionKey, fieldKey);
      };
    });

    const onInput = (path: string[], val: string) => {
      emit('input', path, val);
    };

    return {
      fetchSuggestionsFunc,
      onInput
    };
  }
});
</script>


<style lang="scss">
  //@import './Formsection?.scss'; // Imported in JS so that Webpack de-duplicates redundant copies
</style>
