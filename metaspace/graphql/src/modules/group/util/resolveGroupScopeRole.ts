import { Context } from '../../../context'
import { ScopeRole, ScopeRoleOptions } from '../../../bindingTypes'
import { UserGroup as UserGroupModel, UserGroupRoleOptions } from '../model'

export const resolveGroupScopeRole = async(ctx: Context, groupId?: string): Promise<ScopeRole> => {
  let scopeRole = ScopeRoleOptions.OTHER
  if (ctx.user.id && groupId) {
    const userGroup = await ctx.entityManager.getRepository(UserGroupModel).findOne({
      where: { userId: ctx.user.id, groupId },
    })
    if (userGroup) {
      if (userGroup.role === UserGroupRoleOptions.MEMBER) {
        scopeRole = ScopeRoleOptions.GROUP_MEMBER
      } else if (userGroup.role === UserGroupRoleOptions.GROUP_ADMIN) {
        scopeRole = ScopeRoleOptions.GROUP_MANAGER
      }
    }
  }
  return scopeRole
}
