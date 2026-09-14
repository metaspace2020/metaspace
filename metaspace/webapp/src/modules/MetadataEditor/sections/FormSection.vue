<template>
  <div class="metadata-section">
    <el-form class="flex" size="default" label-position="top">
      <el-col :span="6">
        <div class="metadata-section__title">
          {{ section?.title }}
          <el-popover v-if="section?.help" trigger="hover" placement="top">
            <p>{{ section?.help }}</p>
            <template #reference>
              <i class="el-icon-question metadata-help-icon" />
            </template>
          </el-popover>
        </div>
      </el-col>
      <el-col :span="18">
        <el-row :gutter="8">
          <el-col v-for="(field, fieldKey) in primaryFields" :key="fieldKey" :span="field.smEditorColWidth">
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
              @input="(val) => onInput([sectionKey, fieldKey], val)"
            />
          </el-col>
        </el-row>
        <!-- metadata schema v2 - tier: extension fields (niche/facility, never required) are
             collapsed by default so the larger field count the new schema brings stays tolerable.
             core/recommended fields above are never collapsed. -->
        <el-collapse v-if="Object.keys(extensionFields).length > 0" class="metadata-section__advanced">
          <el-collapse-item title="Advanced">
            <el-row :gutter="8">
              <el-col v-for="(field, fieldKey) in extensionFields" :key="fieldKey" :span="field.smEditorColWidth">
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
                  @input="(val) => onInput([sectionKey, fieldKey], val)"
                />
              </el-col>
            </el-row>
          </el-collapse-item>
        </el-collapse>
      </el-col>
    </el-form>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, PropType } from 'vue'
import { memoize, pickBy } from 'lodash-es'
import FormField from '../inputs/FormField.vue'
import { FormFieldProperty, FormSectionProperty } from '../formStructure'
import { ElCol, ElCollapse, ElCollapseItem, ElForm, ElPopover, ElRow } from '../../../lib/element-plus'
import './FormSection.scss'

export default defineComponent({
  name: 'FormSection',
  components: {
    FormField,
    ElCol,
    ElCollapse,
    ElCollapseItem,
    ElForm,
    ElPopover,
    ElRow,
  },
  props: {
    sectionKey: {
      type: String as PropType<string>,
      required: true,
    },
    section: {
      type: Object as PropType<FormSectionProperty>,
      required: true,
    },
    value: {
      type: Object as PropType<Record<string, any>>,
      required: true,
    },
    error: {
      type: Object as PropType<Record<string, any>>,
      default: () => ({}),
    },
    getSuggestionsForField: {
      type: Function as PropType<(q: string, cb: any, ...path: string[]) => void>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const fetchSuggestionsFunc = memoize((fieldKey: string) => {
      return (q: string, cb: any) => {
        props.getSuggestionsForField(q, cb, props.sectionKey, fieldKey)
      }
    })

    // metadata schema v2 - progressive disclosure by tier. Legacy schemas have no `tier`
    // annotation, so deriveFullSchema defaults every field to 'core' - meaning extensionFields is
    // always empty and this is a no-op until the new schema actually sets tier: extension on
    // something. Explicit Record<string, FormFieldProperty> return type: pickBy's inferred type
    // otherwise widens the v-for key to `string | number | symbol` in the template.
    const primaryFields = computed<Record<string, FormFieldProperty>>(() =>
      pickBy(props.section?.properties, (f) => f.tier !== 'extension')
    )
    const extensionFields = computed<Record<string, FormFieldProperty>>(() =>
      pickBy(props.section?.properties, (f) => f.tier === 'extension')
    )

    const onInput = (path: string[], val: string) => {
      emit('input', path, val)
    }

    return {
      fetchSuggestionsFunc,
      primaryFields,
      extensionFields,
      onInput,
    }
  },
})
</script>
