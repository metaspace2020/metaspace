import { applyQueryFilters } from '../queryFilters'
import { esAnnotationByID, esCountResults, esSearchResults } from '../../../../esConnector'
import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'

const QueryResolvers: FieldResolversFor<Query, void> = {
  async allAnnotations(source, args, ctx) {
    const { postprocess, args: newArgs } = await applyQueryFilters(ctx, args)
    let annotations = await esSearchResults(newArgs, 'annotation', ctx.user)

    if (postprocess != null) {
      annotations = postprocess(annotations)
    }

    return annotations
  },

  async countAnnotations(source, args, ctx) {
    const { args: newArgs } = await applyQueryFilters(ctx, args)

    return await esCountResults(newArgs, 'annotation', ctx.user)
  },

  async annotation(_, { id }, ctx) {
    return await esAnnotationByID(id, ctx.user)
  },
}
export default QueryResolvers
