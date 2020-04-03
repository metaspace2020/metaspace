<template>
  <div class="tf-outer border-gray-300 border border-solid text-sm pr-3">
    <div
      v-if="name || 'name' in $slots"
      class="tf-name bg-gray-100 text-gray-600 tracking-tight px-3 border-0 border-r border-solid border-gray-300"
    >
      <slot name="name">
        {{ name }}:
      </slot>
      <component
        :is="helpComponent"
        v-if="helpComponent"
      />
    </div>

    <el-popover
      v-if="'edit' in $slots"
      trigger="click"
      placement="bottom"
      :width="width"
      class="tf-value-container pl-3"
    >
      <slot name="edit" />
      <div
        slot="reference"
        class="tf-value"
      >
        <slot name="show" />
        <component
          :is="helpComponent"
          v-if="helpComponent && !(name || 'name' in $slots)"
          style="align-self: center"
        />
      </div>
    </el-popover>
    <div
      v-else-if="'show' in $slots"
      class="tf-value pl-3"
    >
      <slot name="show" />
    </div>
    <button
      v-if="removable"
      title="Remove filter"
      class="tf-remove button-reset el-icon-close pl-3 text-gray-600 text-base"
      @click="destroy"
    />
  </div>
</template>

<script lang="ts">
import Vue, { ComponentOptions } from 'vue'

 interface TagFilter extends Vue {
   name: string
   removable: boolean
   width: number
   destroy(): void
 }

export default {
  name: 'tag-filter',
  props: {
    name: String,
    helpComponent: Object,
    removable: { type: Boolean, default: true },
    width: { type: Number, default: 300 },
  },
  methods: {
    destroy() {
      this.$emit('destroy', this.name)
    },
  },
} as ComponentOptions<TagFilter>
</script>

<style lang="scss">

 .tf-outer {
   display: flex;
   align-items: stretch;
   text-align: center;
   box-sizing: border-box;
   margin: 5px;
   border-radius: 4px;
   height: 40px; /* Height should match height of element UI inputs */
   max-width: 300px;
   overflow: hidden;
 }

 .tf-name {
   display: flex;
   align-items: center;
   flex: none;
 }

 .tf-value-container {
   display: flex;
   overflow: hidden;
 }

 .tf-value {
   display: flex;
   align-items: center;
   overflow: hidden;
   flex: auto;
 }

.tf-value.el-popover__reference {
  cursor: pointer;
  outline: none; /* Safari visual bug */
}

 .tf-value-suffix {
   align-self: center;
   padding: 5px 5px 6px 0;
   white-space: nowrap;
 }

 .tf-value-span {
   flex: auto;
   padding: 2px 0 1px 0;
   border-bottom: 1px dashed #000;
   text-decoration: none;
   text-align: start;
   text-overflow: ellipsis;
   overflow: hidden;
   white-space: nowrap;
 }

  .tf-value-input input, input.tf-value-input {
    border: none;
    outline: none;
    // This takes styles from "html" and "#app" in App.vue to make the text match the other filters
    font-family: 'Roboto', Helvetica, sans-serif;
    font-size: inherit;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: inherit;

    &::-ms-clear {
      display: none;
    }
    &[type='number'] {
      width: 100px; // IE11 fix - inputs without a "width" won't follow flex-shrink rules
      -moz-appearance: textfield; // Firefox fix - something is broken with the up/down buttons on input[type='number']s on win 10 so just hide them
    }
    &[type='text'] {
      width: 200px; // IE11 fix - inputs without a "width" won't follow flex-shrink rules
    }
    &::placeholder {
      @apply text-gray-500;
    }
  }

 .tf-remove {
   align-self: center;
   cursor: pointer;
 }

 .el-popover > .el-select {
   width: 100%;
 }

 /*
 .fade-leave-active {
   animation: remove-filter-animation 0.1s linear forwards;
 }

 @keyframes remove-filter-animation {
   from {
     opacity: 1;
     transform: translateY(0);
   }

   to {
     opacity: 0;
     transform : translateY(30px);
   }
 }
 */
</style>
