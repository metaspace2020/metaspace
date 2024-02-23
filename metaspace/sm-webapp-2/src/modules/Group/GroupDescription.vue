<template>
  <div>
    <div v-if="modes.saved || modes.preview" v-html="embedMarkdownAsHtml()" />
    <el-popover v-if="modes.edit" placement="top-end" :visible="showHint">
      <div>
        You can use markdown language to format your description.
        <br />
        <a
          style="margin-top: 5px"
          rel="nofollow noopener noreferrer"
          target="_blank"
          href="http://www.unexpected-vortices.com/sw/rippledoc/quick-markdown-example.html"
        >
          Learn more about it</a
        >
        <br />
        <el-button style="margin-top: 5px" type="primary" size="small" @click="disableHint"> It's clear </el-button>
      </div>
      <template #reference>
        <el-input v-model="groupDescriptionAsHtml" type="textarea" :autosize="{ minRows: 10, maxRows: 50 }" />
      </template>
    </el-popover>
    <el-button-group v-if="canEdit" class="btngroup">
      <el-button
        v-if="modes.saved || modes.preview"
        class="btn"
        type="primary"
        size="default"
        icon="EditPen"
        @click="editTextDescr"
      >
        Edit
      </el-button>
      <el-button v-if="modes.edit" class="btn" type="primary" size="default" icon="View" @click="prevMarkdown">
        Preview
      </el-button>
      <el-button
        v-if="modes.edit || modes.preview"
        class="btn"
        type="success"
        size="default"
        icon="Check"
        @click="saveMarkdown"
      >
        Save
      </el-button>
    </el-button-group>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch, nextTick } from 'vue'
import { parse } from 'marked'
import sanitizeIt from '../../lib/sanitizeIt'
import { getLocalStorage, setLocalStorage } from '../../lib/localStorage'
import { ElPopover, ElInput, ElButton, ElButtonGroup } from '../../lib/element-plus'

interface ViewGroupResult {
  // Define properties based on your requirements
  groupDescriptionAsHtml?: string
}

interface Modes {
  preview: boolean
  saved: boolean
  edit: boolean
}

export default defineComponent({
  components: {
    ElPopover,
    ElInput,
    ElButton,
    ElButtonGroup,
  },
  props: {
    group: Object as () => ViewGroupResult | undefined,
    canEdit: { type: Boolean, default: false },
  },
  setup(props, { emit }) {
    const groupDescriptionAsHtml = ref(props.group?.groupDescriptionAsHtml || '')
    const showHint = ref(false)
    const modes = ref<Modes>({ preview: false, saved: true, edit: false })

    watch(
      () => props.group?.groupDescriptionAsHtml,
      (newVal) => {
        groupDescriptionAsHtml.value = newVal || ''
      }
    )

    const editTextDescr = () => {
      modes.value = { preview: false, saved: false, edit: true }
      nextTick(() => {
        showHint.value = !getLocalStorage<boolean>('hideMarkdownHint')
      })
    }

    const saveMarkdown = () => {
      emit('updateGroupDescription', groupDescriptionAsHtml.value)
      modes.value = { preview: false, saved: true, edit: false }
      nextTick(() => {
        if (showHint.value) {
          showHint.value = false
        }
      })
    }

    const prevMarkdown = () => {
      if (showHint.value) {
        showHint.value = false
      }
      modes.value = { preview: true, saved: false, edit: false }
    }

    const disableHint = () => {
      showHint.value = false
      setLocalStorage('hideMarkdownHint', true)
    }

    const embedMarkdownAsHtml = () => {
      return sanitizeIt(parse(groupDescriptionAsHtml.value))
    }

    return {
      groupDescriptionAsHtml,
      showHint,
      modes,
      editTextDescr,
      saveMarkdown,
      prevMarkdown,
      disableHint,
      embedMarkdownAsHtml,
    }
  },
})
</script>

<style scoped>
.btngroup {
  margin: 20px 0;
}

.btn {
  padding: 8px 20px;
}
</style>
