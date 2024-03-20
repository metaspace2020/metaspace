<template>
  <tag-filter :removable="removable" @destroy="destroy">
    <template v-slot:show>
      {{ name }}
    </template>
  </tag-filter>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import TagFilter from './TagFilter.vue'

export default defineComponent({
  name: 'BooleanFilter',
  components: {
    TagFilter,
  },
  props: {
    name: {
      type: String,
      required: true,
    },
    removable: {
      type: Boolean,
      default: true,
    },
  },
  setup(props, { emit }) {
    const destroy = () => {
      emit('destroy')
    }

    return {
      ...props,
      destroy,
    }
  },
})
</script>
