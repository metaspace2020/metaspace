<template>
  <tag-filter :name="name" @destroy="destroy">
    <el-select slot="edit"
               multiple filterable clearable
               :multiple-limit=10
               v-model="value2" @change="onChange">
      <el-option v-for="(item, idx) in options"
                 :label="labels ? labels[idx] : item" :value="item" :key="item">
      </el-option>
    </el-select>

    <span slot="show" class="tf-value-span">
      <span v-if="value2.length == 1">
        {{ valueToLabel[value2[0]] }}
      </span>
      <span v-if="value2.length > 1" >
        ({{ value2.length }} items selected)
      </span>
      <span v-if="value2.length == 0">
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
   props: ["name", "options", "value", "labels"],
   data() {
     return {
       // horrible workaround
       // FIXME: submit an issue to ElementUI bugtracker
       value2: this.value || []
     }
   },
   watch: {
     value(newValue) {
       this.value2 = newValue;
     }
   },
   computed: {
     valueToLabel() {
       if (!this.options) return {};
       let dict = {}
       for (let i = 0; i < this.options.length; i++) {
         dict[this.options[i]] = this.labels ? this.labels[i] : this.options[i];
       }
       return dict;
     }
   },
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
