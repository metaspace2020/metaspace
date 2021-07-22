import { UserGroup as UserGroupModel } from '../model'
import { Context, ContextUser } from '../../../context'
import { UserGroupRole } from '../../../binding'
import { EntityManager } from 'typeorm'

export const getCurrentUserGroupRolesUncached = async(entityManager: EntityManager, user: ContextUser)
  : Promise<Record<string, UserGroupRole>> => {
  if (!user.id) {
    return Promise.resolve({})
  }
  const userGroups = await entityManager.getRepository(UserGroupModel).find({
    where: { userId: user.id },
  })
  const groupRoleMapping: Record<string, UserGroupRole> = {}
  userGroups.forEach(group => { groupRoleMapping[group.groupId] = group.role })
  return groupRoleMapping
}

export default (ctx: Context): Promise<Record<string, UserGroupRole>> => {
  return ctx.contextCacheGet('getCurrentUserGroupRoles', [], () => {
    return getCurrentUserGroupRolesUncached(ctx.entityManager, ctx.user)
  })
}
