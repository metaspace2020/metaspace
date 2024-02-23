<template>
  <div class="metadata-section">
    <el-row>
      <el-col :span="6">
        <div class="metadata-section__title">
          Visibility
          <el-popover trigger="hover" placement="top">
            <div class="max-w-sm">
              <p>
                <b>Public:</b> Annotations will be available in the METASPACE public knowledge base, sharable and
                searchable by the community. The imzML files will be made available to download under the
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                >
                  <!-- -->Creative Commons Attribution 4.0 License<!-- --> </a
                >.
              </p>
              <p>
                <b>Private:</b> The dataset and its annotation results will only be visible to you, logged-in members of
                the selected group and projects, and METASPACE administrators. These people will also be able to
                download the imzML files, but no automatic license for usage will be granted.
              </p>
            </div>
            <template #reference>
              <i class="el-icon-question metadata-help-icon" />
            </template>
          </el-popover>
        </div>
      </el-col>
      <el-col :span="18" style="padding: 0 5px">
        <el-switch
          :model-value="isPublic"
          active-text="Public"
          inactive-text="Private"
          @change="handleChangeIsPublic"
        />
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, watch, ref } from 'vue'
import { ElSwitch, ElRow, ElCol, ElPopover } from 'element-plus'
import './FormSection.scss'

export default defineComponent({
  name: 'VisibilityOptionSection',
  components: {
    ElSwitch,
    ElRow,
    ElCol,
    ElPopover,
  },
  props: {
    isPublic: {
      type: Boolean as PropType<boolean>,
      required: true,
    },
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
