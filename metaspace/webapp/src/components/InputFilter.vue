<template>
  <tag-filter :name="name" :removable="removable"
              @destroy="destroy">
    <el-input slot="edit" :value="value" @change="onChange"></el-input>

    <span slot="show" class="tf-value-span">
      <span v-if="value">
        {{ value }}
      </span>
      <span style="display:inline-block; width: 15px;" v-else>
      </span>
    </span>
  </tag-filter>
</template>

<script>
 import TagFilter from './TagFilter.vue';
 export default {
   name: 'input-filter',
   components: {
     TagFilter
   },
   props: ["name", "options", "value", "removable"],
   methods: {
     onChange(val) {
       this.$emit('input', val);
       this.$emit('change', val);
     },
     destroy() {
       this.$emit('destroy');
     }
   }
 }
</script>
