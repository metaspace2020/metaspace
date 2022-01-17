import { Context } from '../../../context'
import { ScopeRole, ScopeRoleOptions as SRO, UserSource } from '../../../bindingTypes'
import { User as UserModel } from '../model'
import { convertUserToUserSource } from './convertUserToUserSource'

export const resolveUserScopeRole = (ctx: Context, userId?: string): ScopeRole => {
  let scopeRole = SRO.OTHER
  if (userId && userId === ctx.user.id) {
    scopeRole = SRO.PROFILE_OWNER
  }
  return scopeRole
}

export const getUserSourceById = async function(ctx: Context, userId: string): Promise<UserSource | null> {
  const scopeRole = resolveUserScopeRole(ctx, userId)
  const user = await ctx.entityManager.getRepository(UserModel).findOne({
    where: { id: userId },
  })
  return user != null ? convertUserToUserSource(user, scopeRole) : null
}
