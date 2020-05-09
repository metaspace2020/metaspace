<template>
  <tag-filter
    :removable="removable"
    @destroy="destroy"
  >
    <span slot="show">{{ name }}</span>
  </tag-filter>
</template>

<script lang="ts">
import TagFilter from './TagFilter.vue'
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'

 @Component({
   components: {
     TagFilter,
   },
 })
export default class BooleanFilter extends Vue {
   @Prop({ required: true })
   name!: string;

   @Prop({ type: Boolean, default: true })
   removable!: boolean;

   destroy(): void {
     this.$emit('destroy')
   }
}
</script>
