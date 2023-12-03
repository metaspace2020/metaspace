<template>
  <div class="el-button flex justify-start" :style="buttonStyle" @click="$emit('click')">
    <div :style="progressStyle" />
    <div :style="textStyle">
      <slot />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';

export default defineComponent({
  name: 'ProgressButton',
  props: {
    width: Number,
    height: Number,
    percentage: Number,
  },
  setup(props) {
    const buttonStyle = computed(() => ({
      width: props.width + 'px',
      height: props.height + 'px',
      padding: 0,
    }));

    const textStyle = computed(() => ({
      'z-index': 2,
      position: 'absolute',
      display: 'flex',
      'flex-direction': 'column',
      'justify-content': 'center',
      ...buttonStyle.value,
    }));

    const progressStyle = computed(() => ({
      'background-color': 'rgb(152, 255, 152)',
      width: ((props.width - 2) * props.percentage / 100.0) + 'px',
      height: (props.height - 2) + 'px',
      position: 'absolute',
      'z-index': 1,
    }));

    return {
      buttonStyle,
      textStyle,
      progressStyle,
    };
  },
});
</script>
