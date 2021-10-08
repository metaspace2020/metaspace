<template>
  <tag-filter
    :name="name"
    :removable="removable"
    :help-component="helpComponent"
    @destroy="destroy"
  >
    <el-select
      slot="edit"
      :filterable="filterable"
      :clearable="clearable"
      :value="value"
      @change="onChange"
    >
      <el-option
        v-for="(item, idx) in options"
        :key="idx"
        :label="formatOption(item)"
        :value="valueGetter ? valueGetter(item) : item"
      />
    </el-select>

    <span
      slot="show"
      class="tf-value-span"
    >
      <span v-if="value != null">{{ formatValue(value) }}</span>
      <span v-else>
        (any)
      </span>
    </span>
  </tag-filter>
</template>

<script lang="ts">
import TagFilter from './TagFilter.vue'
import Vue from 'vue'
import { Component, Model, Prop } from 'vue-property-decorator'

 @Component({
   components: {
     TagFilter,
   },
 })
export default class SingleSelectFilter extends Vue {
   @Model('change')
   value?: string | number | Object;

   @Prop({ required: true })
   name!: string;

   @Prop()
   helpComponent!: string | null;

   @Prop({ required: true })
   options!: any[];

   @Prop()
   optionFormatter?: Function;

   @Prop()
   valueGetter?: Function;

   @Prop({ type: Boolean, default: false })
   clearable!: boolean;

   @Prop({ type: Boolean, default: true })
   removable!: boolean;

   @Prop({ type: Boolean, default: true })
   filterable!: boolean;

   onChange(val: any) {
     this.$emit('change', val)
   }

   formatOption(option: any): string {
     if (this.optionFormatter) {
       return this.optionFormatter(option, this.options)
     } else {
       return option + ''
     }
   }

   formatValue(value: any): string {
     if (this.valueGetter != null) {
       const option = this.options.find(opt => this.valueGetter!(opt) === value)
       return option != null ? this.formatOption(option) : value
     } else {
       return value != null ? this.formatOption(value) : value
     }
   }

   destroy(): void {
     this.$emit('destroy')
   }
}
</script>
