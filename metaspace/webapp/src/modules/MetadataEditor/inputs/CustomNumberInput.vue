<template>
  <el-input
    v-bind:value="inputVal"
    @keydown.native="checkNumber"
    @input="val=>updateVal(val)"
    :required="required"
    ref="inpVal"
    type="text">
  </el-input>
</template>

<script lang="ts">
  import Vue from 'vue'
  import { Component, Prop } from 'vue-property-decorator'

  @Component
	export default class CustomNumberInput extends Vue{

  	@Prop()
    value!: number;

    inputVal = this.value;

    checkNumber(val: any){
      let charCode = (val.which) ? val.which : val.keyCode;
      if ((charCode > 31 && (charCode < 48 || charCode > 57))) {
        val.preventDefault();
      } else {
        return true
      }
    }

    updateVal(val: any) {
      console.log(val, this.inputVal)
      this.inputVal = parseInt(val, 10)
      this.$emit('input', this.inputVal);
    }
  }
</script>
