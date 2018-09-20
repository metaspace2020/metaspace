<template>
  <el-row>
    <el-col class="subfield" :span="12">
      <el-form-item :class="{'is-error': error && error.Xaxis}" required>
        <custom-number-input
          :value="value.Xaxis"
          @input="val => onInput('Xaxis', val)"
        ></custom-number-input>
        <div class="subfield-label">size on X-axis</div>
        <span class="error-msg" v-if="error && error.Xaxis">{{ error.Xaxis }}</span>
      </el-form-item>
    </el-col>
    <el-col class="subfield" :span="12">
      <el-form-item :class="{'is-error': error && error.Yaxis}" required>
        <custom-number-input
          :value="value.Yaxis"
          @input="val => onInput('Yaxis', val)"
          :required="required"
        ></custom-number-input>
        <div class="subfield-label">size on Y-axis</div>
        <span class="error-msg" v-if="error && error.Yaxis">{{ error.Yaxis }}</span>
      </el-form-item>
    </el-col>
  </el-row>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import {PixelSize} from '../formStructure';
  import CustomNumberInput from './CustomNumberInput.vue'

  @Component({
    components: {CustomNumberInput}
  })
  export default class PixelSizeInput extends Vue {
    @Prop(Object)
    value!: PixelSize;

    @Prop(Object)
    error!: Record<keyof PixelSize, string>;

    @Prop({ type: Boolean, default: false })
    required!: boolean;

    onInput(fieldName: keyof PixelSize, value: number) {
      const newValue = {
        ...this.value,
        [fieldName]: value
      };
      this.$emit('input', newValue);
    };
  }
</script>

<style>
  .fw-num {
    width: 100%;
  }
</style>
