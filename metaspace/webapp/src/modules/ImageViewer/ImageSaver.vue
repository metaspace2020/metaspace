<template>
  <button
    class="button-reset rounded-full bg-gray-100 shadow-xs h-8 w-8 flex items-center justify-center"
    :class="{ 'cursor-not-allowed': !isSupported }"
    title="Export image"
    @click="onClick"
  >
    <i class="el-icon-download text-xl" />
  </button>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
import domtoimage from 'dom-to-image-google-font-issue'
import { saveAs } from 'file-saver'
import { MessageBox } from '../../lib/element-ui'

function showBrowserWarning() {
  MessageBox.alert('Due to technical limitations we are only able to support downloading layered and/or zoomed images'
  + ' on Chrome and Firefox. As a workaround, it is possible to get a copy of the raw ion image by right-clicking '
  + 'it and clicking "Save picture as", however this will not take into account your current zoom '
  + 'settings or show the optical image.')
    .catch(() => { /* Ignore exception raised when alert is closed */ })
}

interface Props {
  domNode: HTMLElement | null,
  fileName: string,
}

export default defineComponent<Props>({
  props: {
    domNode: { required: true },
    fileName: String,
  },
  setup(props) {
    const isSupported = (
      window.navigator.userAgent.includes('Chrome')
      || window.navigator.userAgent.includes('Firefox')
    )

    const save = async() => {
      const node = props.domNode
      if (node) {
        const blob = await domtoimage.toBlob(node, {
          width: node.clientWidth,
          height: node.clientHeight,
          filter: el => !el.classList || !el.classList.contains('dom-to-image-hidden'),
        })
        saveAs(blob, `${props.fileName || 'METASPACE'}.png`)
      }
    }

    return {
      isSupported,
      onClick: isSupported ? save : showBrowserWarning,
    }
  },
})
</script>
