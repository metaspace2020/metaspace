<template>
  <!-- <tag-filter> not used because it requires 2 clicks to open the drop-down list, which is inconvenient for "quick" filters

  <tag-filter :removable="false">
    <div slot="name">
      <svg class="filter-icon" viewBox="190 256 1412 1410" xmlns="http://www.w3.org/2000/svg"><path d="M1595 295q17 41-14 70l-493 493v742q0 42-39 59-13 5-25 5-27 0-45-19l-256-256q-19-19-19-45v-486l-493-493q-31-29-14-70 17-39 59-39h1280q42 0 59 39z"/></svg>
    </div>
    <el-select slot="edit"
               :value="value"
               @change="onChange">
      <el-option v-for="opt in ungroupedOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
      <el-option-group v-for="grp in groupedOptions" :key="grp.label" :label="grp.label">
        <el-option v-for="opt in grp.options" :key="opt.value" :value="opt.value" :label="opt.label" />
      </el-option-group>
    </el-select>

    <span slot="show" class="tf-value-span">
      {{ selectedLabel }}
    </span>
  </tag-filter>
  -->
  <!-- from assets/filter-icon.svg with viewBox changed to reduce padding-->

  <el-select
    class="filter-select"
    :value="value"
    @change="onChange"
  >
    <el-option
      v-for="opt in ungroupedOptions"
      :key="opt.value"
      :value="opt.value"
      :label="opt.label"
    />
    <el-option-group
      v-for="grp in groupedOptions"
      :key="grp.label"
      :label="grp.label"
    >
      <el-option
        v-for="opt in grp.options"
        :key="opt.value"
        :value="opt.value"
        :label="opt.label"
      />
    </el-option-group>
  </el-select>
</template>

<script lang="ts">
import Vue from 'vue'
import { FilterKey } from '../filterSpecs'
import { groupBy } from 'lodash-es'
import { Component, Prop } from 'vue-property-decorator'
import TagFilter from './TagFilter.vue'

 interface SimpleFilterOption {
   value: string;
   label: string;
   group?: string;
   filter?: Partial<Record<FilterKey, any>>;
 }

 interface SimpleFilterGroup {
   label: string;
 }

 /**
  * In its current state SimpleFilterBox is only used for showing a couple options on the Projects page.
  * In future it should be used for adding some convenient preset filters to the Datasets page, which will require
  * changing `onChange` to apply the appropriate filters when an option is selected.
  */
 @Component<SimpleFilterBox>({
   name: 'simple-filter-box',
   components: {
     TagFilter,
   },
 })
export default class SimpleFilterBox extends Vue {
   @Prop()
   name!: string | null;

   @Prop()
   value!: string | null;

   @Prop()
   options!: SimpleFilterOption[];

   get ungroupedOptions(): SimpleFilterOption[] {
     return this.options.filter(opt => opt.group == null)
   }

   get groupedOptions(): SimpleFilterGroup[] {
     const optionsWithGroup = this.options.filter(opt => opt.group != null)
     const groupMap = groupBy(optionsWithGroup, 'group')
     return Object.entries(groupMap).map(([label, options]) => ({ label, options }))
   }

   get selectedLabel() {
     const option = this.options.find(opt => opt.value === this.value)
     return option && option.label
   }

   onChange(val: string) {
     this.$emit('input', val)
     this.$emit('change', val)
   }
}
</script>
