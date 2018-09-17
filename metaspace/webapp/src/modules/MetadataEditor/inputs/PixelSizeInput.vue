<template>
  <el-row>
    <el-col class="subfield" :span="12">
      <el-form-item :class="{'is-error': error && error.PS_X}" required>
        <el-input
          type="number"
          class="fw-num"
          @input="val => onInput('PS_X', val)"
          :value="value.PS_X"
          :required="required"
        />
        <div class="subfield-label">size in X-axis<span style="color: red;">*</span></div>
        <span class="error-msg" v-if="error && error.PS_X">{{ error.PS_X }}</span>
      </el-form-item>
    </el-col>

    <el-col class="subfield" :span="12">
      <el-form-item :class="{'is-error': error && error.PS_Y}" required>
        <el-input
          type="number"
          class="fw-num"
          @input="val => onInput('PS_Y', val)"
          :value="value.PS_Y"
          :required="required"
        />
        <div class="subfield-label">size in Y-axis<span style="color: red;">*</span></div>
        <span class="error-msg" v-if="error && error.PS_Y">{{ error.PS_Y }}</span>
      </el-form-item>
    </el-col>
  </el-row>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import {PixelSize} from '../formStructure';

  @Component({name: 'pixel-size-input'})
  export default class PixelSizeInput extends Vue {
    @Prop(Object)
    value!: PixelSize;

    @Prop(Object)
    error!: Record<keyof PixelSize, string>;

    @Prop({ type: Boolean, default: false })
    required!: boolean;

    onInput(fieldName: keyof PixelSize, value: string) {
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
