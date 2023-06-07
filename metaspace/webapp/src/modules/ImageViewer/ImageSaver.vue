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
  label: string,
}

export default defineComponent<Props>({
  props: {
    domNode: { required: true },
    fileName: String,
    label: String,
  },
  setup(props) {
    const isSupported = (
      window.navigator.userAgent.includes('Chrome')
      || window.navigator.userAgent.includes('Firefox')
    )

    const attachLabelToBlob = (blob: any, intensityBlob: any) => {
      const image = new Image()

      image.src = URL.createObjectURL(blob)

      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height + 80 // Adjust height to accommodate the label
        const context = canvas.getContext('2d')

        context!.drawImage(image, 0, 65)

        context!.fillStyle = intensityBlob ? 'white' : 'transparent'
        context!.fillRect(0, 0, image.width, 40)

        const intensityImage = new Image()
        context!.font = 'bold 14px Roboto'
        context!.fillStyle = 'black'
        context!.textAlign = 'center'

        const label = props.label
        const labelX = context!.measureText(label).width / 2 + 10
        const labelY = 25
        context!.fillText(label, labelX, labelY)

        if (intensityBlob) {
          intensityImage.src = URL.createObjectURL(intensityBlob)
          intensityImage.onload = () => {
            context!.drawImage(intensityImage, image.width - 200, 0, 200, 40)

            canvas.toBlob((labeledBlob: any) => {
              saveAs(labeledBlob, `${props.fileName || 'METASPACE'}.png`)
            })
          }
        } else {
          canvas.toBlob((labeledBlob: any) => {
            saveAs(labeledBlob, `${props.fileName || 'METASPACE'}.png`)
          })
        }
      }
    }

    const save = async() => {
      const node = props.domNode
      if (node) {
        const divElement = document.querySelector('#intensity-controller') as HTMLElement
        let intensityBlob = null
        if (divElement) {
          intensityBlob = await domtoimage.toBlob(divElement, {
            width: divElement.clientWidth,
            height: divElement.clientHeight,
            style: {
              background: 'white',
            },
          })
        }

        const blob = await domtoimage.toBlob(node, {
          width: node.clientWidth,
          height: node.clientHeight,
          filter: el => !el.classList || !el.classList.contains('dom-to-image-hidden'),
        })

        if (props.label) {
          attachLabelToBlob(blob, intensityBlob)
        } else {
          saveAs(blob, `${props.fileName || 'METASPACE'}.png`)
        }
      }
    }

    return {
      isSupported,
      onClick: isSupported ? save : showBrowserWarning,
    }
  },
})
</script>
