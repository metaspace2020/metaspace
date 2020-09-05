import { defineComponent } from '@vue/composition-api'
import { Image } from 'upng-js'

import ImageHandler from './ImageHandler.vue'
import FadeTransition from '../../components/FadeTransition'

import { ScaleType } from '../../lib/ionImageRendering'

interface State {
  ionImageUrl: string | null
  ionImagePng: Image[] | null
  ionImageIsLoading: boolean
  imageViewerWidth: number
  imageViewerHeight: number
}

interface Props {
  annotation: any
  colormap: string
  opacity: number
  imageLoaderSettings: any
  applyImageMove: Function
  pixelSizeX: number
  pixelSizeY: number
  scaleBarColor: string | null
  scaleType?: ScaleType
}

const ImageViewer = defineComponent<Props>({
  name: 'ImageVewer',
  props: {
    annotation: { required: true, type: Object },
    colormap: { required: true, type: String },
    opacity: { required: true, type: Number },
    imageLoaderSettings: { required: true, type: Object },
    applyImageMove: { required: true, type: Function },
    pixelSizeX: { type: Number },
    pixelSizeY: { type: Number },
    scaleBarColor: { type: String },
    scaleType: { type: String },
  },
  setup(props) {
    return () => (
      <div>
        {props.imageLoaderSettings
        && <ImageHandler
          annotation={props.annotation}
          colormap={props.colormap}
          opacity={props.opacity}
          imageLoaderSettings={props.imageLoaderSettings}
          applyimageMove={props.applyImageMove}
          pixelSizeX={props.pixelSizeX}
          pixelSizeY={props.pixelSizeY}
          scaleBarColor={props.scaleBarColor}
          scaleType={props.scaleType}
        />}
      </div>
    )
  },
})

export default ImageViewer
