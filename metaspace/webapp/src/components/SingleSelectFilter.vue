<template>
  <tag-filter :name="name" :removable="removable"
              @destroy="destroy">
    <el-select slot="edit"
               :filterable="filterable" :clearable="clearable" :value="value" @change="onChange">
      <el-option v-for="(item, idx) in options"
                 :label="formatOption(item)" :value="item" :key="idx">
      </el-option>
    </el-select>

    <span slot="show" class="tf-value-span">
      <span v-if="value" v-html="formatValue(value)"></span>
      <span v-else>
        (any)
      </span>
    </span>
  </tag-filter>
</template>

<script lang="ts">
 import TagFilter from './TagFilter.vue';
 import Vue from 'vue';
 import { Component, Model, Prop } from 'vue-property-decorator'

 type Option = string | number;

 @Component({
   components: {
     TagFilter
   }
 })
 export default class SingleSelectFilter extends Vue {
   @Model('change')
   value?: string | number | Object;

   @Prop({required: true})
   name!: string;
   @Prop({required: true})
   options!: any[];
   @Prop()
   optionFormatter?: Function;
   @Prop()
   valueFormatter?: Function;
   @Prop({type: Boolean, default: false})
   clearable!: boolean;
   @Prop({type: Boolean, default: true})
   removable!: boolean;
   @Prop({type: Boolean, default: true})
   filterable!: boolean;

   onChange(val: Option) {
     this.$emit('change', val);
   }

   formatOption(option: Option): string {
     if (this.optionFormatter)
       return this.optionFormatter(option);
     else
       return option + '';
   }

   formatValue(value: Option): string {
     if (this.valueFormatter)
       return this.valueFormatter(value);
     else
       return value + '';
   }

   destroy(): void {
     this.$emit('destroy');
   }
 };
</script>
