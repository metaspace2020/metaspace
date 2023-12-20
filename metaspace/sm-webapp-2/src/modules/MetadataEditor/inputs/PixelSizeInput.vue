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
import { defineComponent, PropType } from 'vue';
import CustomNumberInput from './CustomNumberInput.vue';
import { PixelSize } from '../formStructure';

export default defineComponent({
  name: 'PixelSizeInput',
  components: {
    CustomNumberInput,
  },
  props: {
    value: {
      type: Object as PropType<PixelSize>,
      required: true,
    },
    error: {
      type: Object as PropType<Record<keyof PixelSize, string>>,
      default: () => ({}),
    },
    required: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['input'],
  setup(props, { emit }) {
    const onInput = (fieldName: keyof PixelSize, value: number) => {
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
