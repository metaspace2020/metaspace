import { FieldResolversFor } from '../../../bindingTypes'
import { ImageSegmentationJob as ImageSegmentationJobBinding } from '../../../binding'
import { resolveImageUrl } from '../../../utils/imageStorageUrl'
import { ImageSegmentationJob as ImageSegmentationJobModel } from '../../engine/model'

/**
 * Field resolvers for `ImageSegmentationJob`. Results and the label map come from the job row only.
 */
const ImageSegmentationJob: FieldResolversFor<ImageSegmentationJobBinding, ImageSegmentationJobModel> = {
  isMine(source, args, ctx) {
    return ctx.user.id != null && source.userId === ctx.user.id
  },

  resultData(source) {
    return source.result != null ? JSON.stringify(source.result) : null
  },

  labelMapUrl(source) {
    if (source.labelMapImageId == null) {
      return null
    }
    return resolveImageUrl({
      imageType: 'diag',
      dsId: source.datasetId,
      imageId: source.labelMapImageId,
      storedUrl: source.labelMapImageUrl,
    })
  },
}

export default ImageSegmentationJob
