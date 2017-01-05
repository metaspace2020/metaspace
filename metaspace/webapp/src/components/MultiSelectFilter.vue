<template>
  <tag-filter :name="name" @destroy="destroy">
    <el-select slot="edit"
               multiple filterable clearable
               :value="value" @change="onChange">
      <el-option v-for="item in options"
                 :label="item" :value="item">
      </el-option>
    </el-select>

    <span slot="show" class="tf-value-span">
      <span v-if="value && value.length == 1">
        {{ value[0] }}
      </span>
      <span v-if="value && value.length > 1" >
        ({{ value.length }} items selected)
      </span>
      <span v-if="value.length == 0">
        (any)
      </span>
    </span>
  </tag-filter>
</template>

<script>
 import TagFilter from './TagFilter.vue';
 export default {
   name: 'multi-select-filter',
   components: {
     TagFilter
   },
   props: ["name", "options", "value"],
   methods: {
     onChange(val) {
       this.$emit('input', val);
       this.$emit('change', val);
     },
     destroy(val) {
       this.$emit('destroy');
     }
   }
 }
</script>
