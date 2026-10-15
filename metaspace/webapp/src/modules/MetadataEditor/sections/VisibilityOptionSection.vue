<template>
  <section-row class="md-visibility" title="Visibility">
    <template #title>
      Visibility
      <el-popover trigger="hover" placement="right">
        <div class="max-w-xs">
          To understand the difference between public and private datasets, as well as how quota usage works, please
          refer to <a href="/plans" target="_blank">METASPACE Pro</a>.
        </div>
        <template #reference>
          <el-icon class="cursor-pointer" color="var(--el-color-warning)" size="14"><WarnTriangleFilled /></el-icon>
        </template>
      </el-popover>
      <el-popover trigger="hover" placement="top">
        <div class="max-w-sm">
          <p>
            <b>Public:</b> Annotations will be available in the METASPACE public knowledge base, sharable and searchable
            by the community. The imzML files will be made available to download under the
            <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer nofollow" target="_blank">
              <!-- -->Creative Commons Attribution 4.0 License<!-- --> </a
            >.
          </p>
          <p>
            <b>Private:</b> The dataset and its annotation results will only be visible to you, logged-in members of the
            selected group and projects, and METASPACE administrators. These people will also be able to download the
            imzML files, but no automatic license for usage will be granted.
          </p>
        </div>
        <template #reference>
          <i class="el-icon-question metadata-help-icon" />
        </template>
      </el-popover>
    </template>
    <div class="flex items-center flex-wrap gap-x-3 gap-y-1">
      <el-switch
        :model-value="isPublic"
        :disabled="disablePublic && !isPublic"
        active-text="Public"
        inactive-text="Private"
        @change="handleChangeIsPublic"
      />
      <span v-if="disablePublic && !isPublic" class="text-xs" style="color: #617f98">{{ disabledReason }}</span>
    </div>
  </section-row>
</template>

<script lang="ts">
import { defineComponent, PropType, watch, ref } from 'vue'
import { ElSwitch, ElPopover, ElIcon } from '../../../lib/element-plus'
import { WarnTriangleFilled } from '@element-plus/icons-vue'
import { SectionRow } from '../v2/components/SectionRow'

export default defineComponent({
  name: 'VisibilityOptionSection',
  components: {
    ElSwitch,
    ElPopover,
    ElIcon,
    WarnTriangleFilled,
    SectionRow,
  },
  props: {
    isPublic: {
      type: Boolean as PropType<boolean>,
      required: true,
    },
    disablePublic: { type: Boolean as PropType<boolean>, default: false },
    disabledReason: { type: String as PropType<string>, default: '' },
  },
  emits: ['change'],
  setup(props, { emit }) {
    const localIsPublic = ref(props.isPublic)

    const handleChangeIsPublic = (val: boolean) => {
      emit('change', val)
    }

    watch(
      () => props.isPublic,
      (newVal) => {
        localIsPublic.value = newVal
      }
    )

    return {
      localIsPublic,
      handleChangeIsPublic,
    }
  },
})
</script>
