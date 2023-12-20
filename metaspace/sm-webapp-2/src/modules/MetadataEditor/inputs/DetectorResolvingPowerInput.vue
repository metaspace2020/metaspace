<template>
  <el-row>
    <el-col class="subfield" :span="12">
      <el-form-item :class="{'is-error': error && error.mz}" required>
        <custom-number-input
          :value="value.mz"
          :precision="0"
          @update:modelValue="val => onInput('mz', val)"
        />
        <div class="subfield-label">m/z</div>
        <span v-if="error && error.mz" class="error-msg">{{ error.mz }}</span>
      </el-form-item>
    </el-col>

    <el-col class="subfield" :span="12">
      <el-form-item :class="{'is-error': error && error.Resolving_Power}" required>
        <custom-number-input
          :value="value.Resolving_Power"
          :precision="0"
          @update:modelValue="val => onInput('Resolving_Power', val)"
        />
        <div class="subfield-label">resolving power</div>
        <span v-if="error && error.Resolving_Power" class="error-msg">{{ error.Resolving_Power }}</span>
      </el-form-item>
    </el-col>
  </el-row>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { DetectorResolvingPower } from '../formStructure';
import CustomNumberInput from './CustomNumberInput.vue';

export default defineComponent({
  name: 'DetectorResolvingPowerInput',
  components: {
    CustomNumberInput,
  },
  props: {
    value: {
      type: Object as PropType<DetectorResolvingPower>,
      required: true,
    },
    error: {
      type: Object as PropType<Record<keyof DetectorResolvingPower, string>>,
      default: () => ({}),
    },
    required: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['input'],
  setup(props, { emit }) {
    const onInput = (fieldName: keyof DetectorResolvingPower, value: string) => {
      const newValue = {
        ...props.value,
        [fieldName]: value,
      };
      emit('input', newValue);
    };

    return {
      onInput,
    };
  },
});
</script>

<style>
.fw-num {
  width: 100%;
}
</style>
