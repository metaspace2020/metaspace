import { DatasetSource } from '../../../bindingTypes'
import { Context } from '../../../context'

/**
 * Checks if a user is allowed to edit a dataset. This is an optimized subset of the permissions checking of
 * getDatasetForEditing(..., {edit: true}). This function shouldn't be considered authoritative as it uses
 * ElasticSearch data, which can be out-of-date.
 * In cases where performance isn't as critical (e.g. when only viewing/editing one dataset),
 * getDatasetForEditing should be used instead, as it uses Postgres data, which is the source of truth.
 *
 * This function is called for every dataset in lists of datasets, so it must be kept fast -
 * queries should only be made when necessary, and should be cached and/or batched by DataLoaders when possible.
 */
export default async(dataset: DatasetSource, ctx: Context) => {
  const ds = dataset._source

  if (ctx.user.id == null) {
    return false
  }
  if (ctx.isAdmin) {
    return true
  }

  const isSubmitter = ctx.user.id === ds.ds_submitter_id
  const isInSameGroup = ds.ds_group_id != null && (await ctx.user.getMemberOfGroupIds()).includes(ds.ds_group_id)
  if (isSubmitter || isInSameGroup) {
    return true
  }

  return false
}
