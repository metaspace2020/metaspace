import { defineComponent } from 'vue'
import {Clock, InfoFilled} from "@element-plus/icons-vue";
import {ElIcon} from "element-plus";

export const TagFilterOuter = defineComponent({
  setup(_, { slots }) {
    return () => (
      <div class="tf-outer border-gray-300 border border-solid text-sm pr-3">
        {slots.default()}
      </div>
    )
  },
})

export const TagFilterName = defineComponent({
  setup(_, { slots }) {
    return () => (
      <div class="tf-name bg-gray-100 text-gray-700 tracking-tight px-3 border-0 border-r border-solid border-gray-300">
        {slots.default()}
      </div>
    )
  },
})

export const TagFilterRemove = defineComponent({
  setup(_, { emit }) {
    return () => (
      <button
        title="Remove filter"
        class="tf-remove button-reset el-icon-close ml-3 text-gray-700 text-base"
        onClick={() => emit('click')}
      />
    )
  },
})

export const FilterHelpText = defineComponent({
  props: {
    icon: { type: String, default: 'info' },
  },
  setup(props, { slots }) {
    return () => (
      <p class="leading-5 text-sm m-0 mt-3 text-gray-700">
        <ElIcon
          class='text-gray-600 mr-1'>
          { props.icon === 'info' && <InfoFilled/> }
          { props.icon === 'time' && <Clock /> }
        </ElIcon>
        {slots.default()}
      </p>
    )
  },
})
