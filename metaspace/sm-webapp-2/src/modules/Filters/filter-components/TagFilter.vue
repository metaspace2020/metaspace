<template>
  <tag-filter-outer>
    <tag-filter-name v-if="name || $slots.name">
      <!-- If you want to provide a default content for the "name" slot -->
      {{ name }}
      <component :is="helpComponent" v-if="helpComponent" />
    </tag-filter-name>

    <el-popover
      v-if="$slots.edit"
      trigger="click"
      placement="bottom"
      :width="width"
      class="tf-value-container pl-3"
      @after-enter="show"
    >
      <!-- Use the slot content here -->
      <template v-slot:default>
        <slot name="edit" />
      </template>
      <template v-slot:reference>
        <div class="tf-value">
          <slot name="show" />
          <component :is="helpComponent" v-if="helpComponent && !(name || $slots.name)" style="align-self: center" />
        </div>
      </template>
    </el-popover>

    <div v-else-if="$slots.show" class="tf-value pl-3">
      <slot name="show" />
    </div>

    <tag-filter-remove v-if="removable" @click="destroy" />
  </tag-filter-outer>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { TagFilterOuter, TagFilterName, TagFilterRemove } from './TagFilterComponents'

// interface TagFilterProps {
//   name: string;
//   helpComponent?: Object;
//   removable: boolean;
//   width: number;
// }

export default defineComponent({
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
  emits: ['destroy', 'show'],
  setup(props, { emit }) {
    const destroy = () => {
      emit('destroy', props.name)
    }

    const show = () => {
      emit('show')
    }

    return {
      destroy,
      show,
    }
  },
})
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
  @apply pl-3;
  cursor: pointer;
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

.tf-value-input input,
input.tf-value-input {
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
