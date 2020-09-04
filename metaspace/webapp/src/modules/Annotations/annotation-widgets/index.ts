import RelatedAnnotations from './default/RelatedAnnotations.vue'
import RelatedAnnotationsLc from './lcms/RelatedAnnotations.vue'
import MainImage from './default/MainImage.vue'
import MainImageLc from './lcms/MainImage.vue'
import MainImageHeader from './default/MainImageHeader'
import MainImageHeaderLc from './lcms/MainImageHeader.vue'
import Diagnostics from './default/Diagnostics.vue'
import DiagnosticsLc from './lcms/Diagnostics.vue'

export default {
  'main-image': {
    default: MainImage,
    'LC-MS': MainImageLc,
  },
  'main-image-header': {
    default: MainImageHeader,
    'LC-MS': MainImageHeaderLc,
  },
  diagnostics: {
    default: Diagnostics,
    'LC-MS': DiagnosticsLc,
  },
  'related-annotations': {
    default: RelatedAnnotations,
    'LC-MS': RelatedAnnotationsLc,
  },
} as any
