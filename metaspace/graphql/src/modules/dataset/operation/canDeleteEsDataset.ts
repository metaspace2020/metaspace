import { DatasetSource } from '../../../bindingTypes'
import { Context } from '../../../context'
import getGroupRoles from '../../group/util/getCurrentUserGroupRoles'
import { UserGroupRoleOptions as UGRO } from '../../group/model'

export default async(dataset: DatasetSource, ctx: Context) => {
  const ds = dataset._source
  if (ctx.user.role === 'admin' || ctx.user.id === ds.ds_submitter_id) {
    return true
  }
  const groupRoles = await getGroupRoles(ctx)
  if (ds.ds_group_id && groupRoles[ds.ds_group_id] === UGRO.GROUP_ADMIN) {
    return true
  }

  return false
}
