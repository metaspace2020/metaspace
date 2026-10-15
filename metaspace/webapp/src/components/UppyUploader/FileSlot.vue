<template>
  <div
    class="sm-file-slot"
    :class="[`sm-file-slot--${slotState}`, { 'opacity-50': status === 'DISABLED' }]"
    :data-status="status"
    @click="onSlotClick"
    @keyup.stop
  >
    <div class="sm-file-slot__icon" :class="{ 'is-filled': status !== 'EMPTY' && status !== 'DISABLED' }">
      <file-icon class="sm-file-slot__doc" />
      <progress-ring
        v-if="status === 'UPLOADING'"
        class="sm-file-slot__ring text-primary"
        :radius="22"
        :stroke="3"
        :progress="progress ?? 0"
      />
    </div>
    <div class="sm-file-slot__text">
      <template v-if="isEmpty">
        <p class="sm-file-slot__name">
          .{{ extension }} file <span class="sm-file-slot__req" aria-hidden="true">*</span>
        </p>
        <p class="sm-file-slot__line">
          Drop here or
          <button type="button" class="sm-file-slot__browse" :disabled="status === 'DISABLED'" @click.stop="browse">
            browse</button
          ><template v-if="hint">
            · {{ hint.text }} (e.g. <code>{{ hint.example[0] }}</code> for <code>{{ hint.example[1] }}</code
            >)</template
          >
        </p>
      </template>
      <template v-else>
        <p class="sm-file-slot__name" :title="name">{{ name }}</p>
        <p class="sm-file-slot__line">
          .{{ extension }}<template v-if="size != null"> · {{ formatBytes(size) }}</template> ·
          <span v-if="status === 'COMPLETE'" class="sm-file-slot__ok">✓ uploaded</span>
          <span v-else-if="status === 'ERROR'" class="sm-file-slot__err">upload failed</span>
          <span v-else-if="status === 'PENDING'">{{
            waitingFor ? `waiting for the .${waitingFor} file` : 'pending'
          }}</span>
          <span v-else>{{ progress ?? 0 }}% uploaded</span>
        </p>
      </template>
    </div>
    <div v-if="!isEmpty" class="sm-file-slot__actions">
      <button v-if="status === 'ERROR'" type="button" class="sm-file-slot__action" @click.stop="$emit('retry')">
        Retry
      </button>
      <button
        v-if="status === 'COMPLETE' || status === 'ERROR' || status === 'PENDING'"
        type="button"
        class="sm-file-slot__action sm-file-slot__replace"
        @click.stop="replace"
      >
        Replace
      </button>
      <button
        v-if="status !== 'DISABLED'"
        type="button"
        class="sm-file-slot__action sm-file-slot__remove"
        title="Remove file"
        aria-label="Remove file"
        @click.stop="$emit('remove')"
      >
        <el-icon class="text-inherit"><Close /></el-icon>
      </button>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, defineAsyncComponent, PropType } from 'vue'
import ProgressRing from '../../components/ProgressRing'
import { ElIcon } from '../../lib/element-plus'
import { Close } from '@element-plus/icons-vue'
import type { FileStatusName } from './FileStatus.vue'
const FileIcon = defineAsyncComponent(() => import('../../assets/inline/refactoring-ui/icon-document.svg'))

/** Human readable byte size with one decimal (e.g. `2.4 MB`). */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`
}

/** Extra help shown after "Drop here or browse" in an empty slot, per required extension; file names render as code. */
const SLOT_HINTS: Record<string, { text: string; example: [string, string] }> = {
  ibd: { text: "must share the imzML's file name", example: ['sample.ibd', 'sample.imzML'] },
  imzml: { text: 'must share the ibd file name', example: ['sample.imzML', 'sample.ibd'] },
}

/**
 * One required file of the two-slot uploader (UppyUploader `variant="slots"`): a dashed drop target
 * while empty, then a file row with name, size and upload state. Emits `browse` (open the picker),
 * `remove`, `retry` and `replace` (remove this file and open the picker). Clicks on a filled slot and keyups
 * inside the slot do not reach the surrounding Dropzone.
 */
export default defineComponent({
  name: 'FileSlot',
  components: { FileIcon, ProgressRing, ElIcon, Close },
  props: {
    extension: { type: String, required: true },
    name: { type: String, default: undefined },
    progress: { type: Number, default: undefined },
    size: { type: Number, default: undefined },
    status: { type: String as PropType<FileStatusName>, required: true },
    /** extension(s) of the required file(s) still missing while this one waits (PENDING) to upload with them */
    waitingFor: { type: String, default: undefined },
  },
  emits: ['browse', 'remove', 'replace', 'retry'],
  setup(props, { emit }) {
    const isEmpty = computed(() => props.status === 'EMPTY' || (props.status === 'DISABLED' && !props.name))
    const slotState = computed(() => {
      if (isEmpty.value) return 'empty'
      if (props.status === 'COMPLETE') return 'complete'
      if (props.status === 'ERROR') return 'error'
      if (props.status === 'PENDING') return 'pending'
      return 'progress'
    })
    return {
      isEmpty,
      slotState,
      hint: computed(() => SLOT_HINTS[props.extension.toLowerCase()]),
      formatBytes,
      browse: () => emit('browse'),
      // the parent removes the file and opens the picker as one step (see UppyUploader `replaceFile`)
      replace: () => emit('replace'),
      // only an empty slot is a click target for the picker; a filled slot acts through its buttons
      onSlotClick: (e: MouseEvent) => {
        if (!isEmpty.value) e.stopPropagation()
      },
    }
  },
})
</script>
<style scoped>
.sm-file-slot {
  display: flex;
  gap: 14px;
  align-items: center;
  min-height: 96px;
  box-sizing: border-box;
  padding: 14px 18px;
  border-radius: 6px;
  cursor: pointer;
}
.sm-file-slot--empty {
  border: 2px dashed #bccddc;
}
.sm-file-slot--complete {
  border: 1px solid #2cba8f;
  background: #f7fcfa;
}
.sm-file-slot--pending {
  border: 1px solid #bccddc;
  background: #fff;
}
.sm-file-slot--progress {
  border: 1px solid #bccddc;
  background: #fafbfc;
}
.sm-file-slot--error {
  border: 1px solid var(--el-color-danger);
  background: #fef6f6;
}
.sm-file-slot__icon {
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #f1f5f8;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sm-file-slot__doc {
  width: 24px;
  height: 24px;
}
.sm-file-slot__doc :deep(.primary) {
  fill: #9fb3c8;
}
.sm-file-slot__doc :deep(.secondary) {
  fill: #829ab1;
}
.sm-file-slot--empty .sm-file-slot__icon.is-filled .sm-file-slot__doc :deep(.primary),
.sm-file-slot--progress .sm-file-slot__doc :deep(.primary) {
  fill: #63a4ff;
}
.sm-file-slot--progress .sm-file-slot__doc :deep(.secondary) {
  fill: #1187ee;
}
.sm-file-slot--complete .sm-file-slot__icon {
  background: #e3f6ef;
}
.sm-file-slot--complete .sm-file-slot__doc :deep(.primary) {
  fill: #5fd3a8;
}
.sm-file-slot--complete .sm-file-slot__doc :deep(.secondary) {
  fill: #2cba8f;
}
.sm-file-slot--error .sm-file-slot__icon {
  background: #fde8e8;
}
.sm-file-slot--error .sm-file-slot__doc :deep(.primary) {
  fill: #f8a5a5;
}
.sm-file-slot--error .sm-file-slot__doc :deep(.secondary) {
  fill: var(--el-color-danger);
}
.sm-file-slot__ring {
  position: absolute;
  top: 0;
  left: 0;
}
.sm-file-slot__text {
  flex: 1;
  min-width: 0;
}
.sm-file-slot__name {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 700;
  color: #324e67;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-file-slot__req {
  color: var(--el-color-danger);
  font-weight: 400;
}
.sm-file-slot__line {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: #617f98;
}
.sm-file-slot__line code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  padding: 0 3px;
  border-radius: 3px;
  background: #f1f5f8;
  color: #324e67;
}
.sm-file-slot__browse {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: var(--el-color-primary);
  text-decoration: underline;
  cursor: pointer;
}
.sm-file-slot__browse:disabled {
  cursor: not-allowed;
}
.sm-file-slot__ok {
  color: #2cba8f;
}
.sm-file-slot__err {
  color: var(--el-color-danger);
}
.sm-file-slot__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.sm-file-slot__action {
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 12px;
  line-height: 16px;
  color: #617f98;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}
.sm-file-slot__action:hover,
.sm-file-slot__action:focus-visible {
  color: var(--el-color-primary);
}
</style>
