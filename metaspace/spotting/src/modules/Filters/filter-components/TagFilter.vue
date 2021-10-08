<template>
  <tag-filter-outer>
    <tag-filter-name v-if="name || 'name' in $slots">
      <slot name="name">
        {{ name }}:
      </slot>
      <component
        :is="helpComponent"
        v-if="helpComponent"
      />
    </tag-filter-name>
    <el-popover
      v-if="'edit' in $slots"
      trigger="click"
      placement="bottom"
      :width="width"
      class="tf-value-container pl-3"
      @after-enter="show"
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
    <tag-filter-remove
      v-if="removable"
      @click="destroy"
    />
  </tag-filter-outer>
</template>

<script lang="ts">
import Vue, { ComponentOptions } from 'vue'
import { TagFilterOuter, TagFilterName, TagFilterRemove } from './TagFilterComponents'

 interface TagFilter extends Vue {
   name: string
   removable: boolean
   width: number
   destroy(): void
 }

export default {
  name: 'tag-filter',
  components: {
    TagFilterOuter,
    TagFilterName,
    TagFilterRemove,
  },
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
    show() {
      this.$emit('show')
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
</style>
