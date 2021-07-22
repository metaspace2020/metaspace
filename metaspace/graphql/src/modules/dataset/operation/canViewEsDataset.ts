import { DatasetSource } from '../../../bindingTypes'
import { ContextUser } from '../../../context'
import { UserProjectRoleOptions as UPRO } from '../../project/model'

/**
 * Dataset visibility permissions logic extracted from esConnector.
 * These rules should be kept in sync with the rules in constructDatasetAuthFilters.
 */
export default async(dataset: DatasetSource, user: ContextUser) => {
  const ds = dataset._source
  if (ds.ds_is_public) {
    return true
  }
  if (user.role === 'admin'
    || user.id === ds.ds_submitter_id) {
    return true
  }
  if (ds.ds_group_id != null) {
    const groupIds = await user.getMemberOfGroupIds()
    if (groupIds.includes(ds.ds_group_id)) {
      return true
    }
  }

  if (ds.ds_project_ids != null && ds.ds_project_ids.length > 0) {
    const projectRoles = await user.getProjectRoles()
    if (ds.ds_project_ids.some(projectId =>
      ([UPRO.MEMBER, UPRO.MANAGER, UPRO.REVIEWER] as any[]).includes(projectRoles[projectId]))) {
      return true
    }
  }
  return false
}
