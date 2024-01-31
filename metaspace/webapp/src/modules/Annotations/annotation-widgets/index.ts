import RelatedAnnotations from './default/RelatedAnnotations.vue'
import MainImage from './default/MainImage.vue'
import MainImageHeader from './default/MainImageHeader.vue'
import Diagnostics from './default/Diagnostics.vue'

import ImageViewer from '../../ImageViewer'
import config from '../../../lib/config'

export default {
  'main-image': {
    default: config.features.multiple_ion_images ? ImageViewer : MainImage,
  },
  'main-image-header': {
    default: MainImageHeader,
  },
  diagnostics: {
    default: Diagnostics,
  },
  'related-annotations': {
    default: RelatedAnnotations,
  },
} as any
