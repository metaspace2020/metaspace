import { DatasetSource } from '../../../bindingTypes'
import { Context } from '../../../context'
import getGroupRoles from '../../group/util/getCurrentUserGroupRoles'
import { UserGroupRoleOptions as UGRO } from '../../group/model'
import { isDatasetInPublicationStatus } from './publicationChecks'
import { PublicationStatusOptions as PSO } from '../../project/Publishing'

/**
 * Checks if a user is allowed to delete a dataset. This is an optimized subset of the permissions checking of
 * getDatasetForEditing(..., {delete: true}). This function shouldn't be considered authoritative as it uses
 * ElasticSearch data, which can be out-of-date.
 * In cases where performance isn't as critical (e.g. when only viewing/editing one dataset),
 * getDatasetForEditing should be used instead, as it uses Postgres data, which is the source of truth.
 *
 * This function is called for every dataset in lists of datasets, so it must be kept fast -
 * queries should only be made when necessary, and should be cached and/or batched by DataLoaders when possible.
 */
export default async(dataset: DatasetSource, ctx: Context) => {
  const ds = dataset._source

  // Anons can never delete
  if (ctx.user.id == null) {
    return false
  }

  // Admins can always delete
  if (ctx.user.role === 'admin') {
    return true
  }

  // Submitters / group admins of the dataset's group can only delete if the dataset isn't in a project that is
  // frozen for publishing. This check is deferred until necessary, as it's the slowest query
  const isInFrozenProject = () => isDatasetInPublicationStatus(
    ctx, ds.ds_id, [PSO.UNDER_REVIEW, PSO.PUBLISHED]
  )
  const isSubmitter = ctx.user.id === ds.ds_submitter_id
  if (isSubmitter) {
    return !(await isInFrozenProject())
  }
  const isDatasetGroupAdmin = ds.ds_group_id != null && ds.ds_group_approved
    && (await getGroupRoles(ctx))[ds.ds_group_id] === UGRO.GROUP_ADMIN
  if (isDatasetGroupAdmin) {
    return !(await isInFrozenProject())
  }

  return false
}
