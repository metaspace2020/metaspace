<template>
  <el-row>
    <el-col
      class="subfield"
      :span="12"
    >
      <el-form-item
        :class="{'is-error': error && error.Xaxis}"
        required
      >
        <custom-number-input
          :value="value.Xaxis"
          @input="val => onInput('Xaxis', val)"
        />
        <div class="subfield-label">
          horizontal
        </div>
        <span
          v-if="error && error.Xaxis"
          class="error-msg"
        >{{ error.Xaxis }}</span>
      </el-form-item>
    </el-col>
    <el-col
      class="subfield"
      :span="12"
    >
      <el-form-item
        :class="{'is-error': error && error.Yaxis}"
        required
      >
        <custom-number-input
          :value="value.Yaxis"
          :required="required"
          @input="val => onInput('Yaxis', val)"
        />
        <div class="subfield-label">
          vertical
        </div>
        <span
          v-if="error && error.Yaxis"
          class="error-msg"
        >{{ error.Yaxis }}</span>
      </el-form-item>
    </el-col>
  </el-row>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { PixelSize } from '../formStructure'
import CustomNumberInput from './CustomNumberInput.vue'

  @Component({
    components: { CustomNumberInput },
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
        [fieldName]: value,
      }
      this.$emit('input', newValue)
    }
}
</script>

<style>
  .fw-num {
    width: 100%;
  }
</style>
