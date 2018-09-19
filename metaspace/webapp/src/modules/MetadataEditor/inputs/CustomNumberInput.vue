<template>
  <el-input
    v-bind:value="inputVal"
    @keydown.native="checkNumber"
    @input="val=>updateVal(val)"
    ref="custInput"
    type="text">
  </el-input>
</template>

<script lang="ts">
  import Vue from 'vue'
  import { Component, Prop } from 'vue-property-decorator'

  @Component
	export default class CustomNumberInput extends Vue{

  	@Prop({default: 0})
    value!: number;

    inputVal: any = this.value;
    arrowsVals: string[] = ['ArrowLeft', 'ArrowRight'];

    checkNumber(val: any){
      let charCode = (val.which) ? val.which : val.keyCode;
      if (charCode > 31 && (charCode < 48 || charCode > 57)
        && (charCode < 96 || charCode > 105) && !this.arrowsVals.includes(val.key)) {
        val.preventDefault();
      } else {
        return true
      }
    }

    updateVal(val: any) {
      // '' is assigned to this.inputVal to make an empty field invalid (in validation)
      if (val === '') {
        this.inputVal = '';
      } else {
        this.inputVal = parseInt(val);
      }
      this.$emit('input', this.inputVal);
    }
  }
</script>
