<template>
  <el-row>
    <el-col class="subfield" :span="12">
      <el-form-item :class="{'is-error': error && error.mz}" required>
        <custom-number-input
          @input="val => onInput('mz', val)"
          :value="value.mz"
          isInteger
        ></custom-number-input>
        <div class="subfield-label">m/z</div>
        <span class="error-msg" v-if="error && error.mz">{{ error.mz }}</span>
      </el-form-item>
    </el-col>

    <el-col class="subfield" :span="12">
      <el-form-item :class="{'is-error': error && error.Resolving_Power}" required>
        <custom-number-input
          @input="val => onInput('Resolving_Power', val)"
          :value="value.Resolving_Power"
          isInteger
        ></custom-number-input>
        <div class="subfield-label">resolving power</div>
        <span class="error-msg" v-if="error && error.Resolving_Power">{{ error.Resolving_Power }}</span>
      </el-form-item>
    </el-col>
  </el-row>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import {DetectorResolvingPower} from '../formStructure';
  import CustomNumberInput from './CustomNumberInput.vue'

  @Component({
    components: {CustomNumberInput}
  })
  export default class DetectorResolvingPowerInput extends Vue {
    @Prop(Object)
    value!: DetectorResolvingPower;

    @Prop(Object)
    error!: Record<keyof DetectorResolvingPower, string>;

    @Prop({ type: Boolean, default: false })
    required!: boolean;

    onInput(fieldName: keyof DetectorResolvingPower, value: string) {
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
