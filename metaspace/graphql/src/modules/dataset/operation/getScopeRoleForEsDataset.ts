import { DatasetSource, ScopeRoleOptions as SRO } from '../../../bindingTypes'
import { UserProjectRoleOptions as UPRO } from '../../project/model'
import { Context } from '../../../context'

export default async(ds: DatasetSource, ctx: Context) => {
  if (ctx.user.id === ds._source.ds_submitter_id) {
    return SRO.PROFILE_OWNER
  }
  if (ds._source.ds_group_id) {
    const groupIds = await ctx.user.getMemberOfGroupIds()
    if (groupIds.includes(ds._source.ds_group_id)) {
      return SRO.GROUP_MEMBER // TODO: Differentiate manager vs member?
    }
  }
  if (ds._source.ds_project_ids && ds._source.ds_project_ids.length > 0) {
    const projects = await ctx.user.getProjectRoles()
    if (ds._source.ds_project_ids.some(id => projects[id] === UPRO.MANAGER)) {
      return SRO.PROJECT_MANAGER
    } else if (ds._source.ds_project_ids.some(id => projects[id] === UPRO.MEMBER)) {
      return SRO.PROJECT_MEMBER
    }
  }
  return SRO.OTHER
}
