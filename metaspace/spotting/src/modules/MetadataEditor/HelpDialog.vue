<template>
  <el-dialog
    :visible="visible"
    :lock-scroll="false"
    title="Upload Help"
    append-to-body
    v-on="$listeners"
  >
    <p>Thank you for considering submitting your data to METASPACE! Here are the key points you need to know:</p>
    <ul class="v-rhythm-5 p-0">
      <li>
        <b>Type of MS:</b> we can annotate only FTICR- or Orbitrap- imaging MS data.
      </li>
      <li>
        <b>Format:</b> we can receive only data in the imzML centroided format.
        Please check out
        <a
          href="https://docs.google.com/document/d/e/2PACX-1vTT4QrMQ2RJMjziscaU8S3gbznlv6Rm5ojwrsdAXPbR5bt7Ivp-ThkC0hefrk3ZdVqiyCX7VU_ddA62/pub"
          target="_blank"
          class="external"
          title="The page will open in a new window"
        >our instructions</a>
        for converting datasets into this format. If you are experiencing difficulties,
        please contact your instrument vendor.
      </li>
    </ul>
    <p>
      If you have any further questions, please check out our main
      <a
        href="/help"
        target="_blank"
        class="external"
        title="The page will open in a new window"
      >help</a>
      page or email us at <a href="mailto:contact@metaspace2020.eu">contact@metaspace2020.eu</a>.
    </p>
    <p>Have fun using METASPACE!</p>
  </el-dialog>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
export default defineComponent({
  props: {
    visible: Boolean,
  },
})
</script>
<style scoped>
.el-dialog__wrapper >>> .el-dialog {
  @apply p-10 leading-5 max-w-measure-2;
}

.el-dialog__wrapper >>> .el-dialog__header,
.el-dialog__wrapper >>> .el-dialog__body {
  padding: 0;
}

.el-dialog__wrapper >>> .el-dialog__header {
  @apply pb-5;
}

.el-dialog__wrapper >>> .el-dialog__title {
  @apply font-medium text-base;
  line-height: inherit;
}

.el-dialog__wrapper >>> .el-dialog__body > * {
  margin: 0;
}

.el-dialog__wrapper >>> .el-dialog__body > * + * {
  @apply mt-5;
}

a[target="_blank"]:after {
  content: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAQElEQVR42qXKwQkAIAxDUUdxtO6/RBQkQZvSi8I/pL4BoGw/XPkh4XigPmsUgh0626AjRsgxHTkUThsG2T/sIlzdTsp52kSS1wAAAABJRU5ErkJggg==);
  margin-left: 4px;
}
</style>
