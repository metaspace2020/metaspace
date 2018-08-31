<template>
  <div class="tf-outer">
    <div class="tf-name">
      <i class="el-icon-search" style="color: white"></i>
    </div>

    <input ref="input"
           class="tf-value-input" type="text"
           style="display: inline-block;"
           placeholder="enter any keywords"
           :value="value" @input="onChange($event.target.value)">

    <div class="tf-remove el-icon-circle-close"
         v-if="removable"
         @click="destroy"></div>
  </div>
</template>

<script lang="ts">
 import Vue, {ComponentOptions} from 'vue';

 interface SearchBox extends Vue {
   name: string
   value: string
   removable: boolean
   onChange(val: string): void
   destroy(): void
 }

 export default {
   name: 'search-box',
   props: {
     value: String,
     removable: {type: Boolean, default: true}
   },
   methods: {
     onChange(val) {
       this.$emit('input', val);
       this.$emit('change', val);
     },
     destroy() {
       this.$emit('destroy', this.name);
     }
  }
 } as ComponentOptions<SearchBox>
</script>
