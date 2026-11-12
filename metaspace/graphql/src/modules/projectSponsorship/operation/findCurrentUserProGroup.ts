import { In } from 'typeorm'
import { Context } from '../../../context'
import { Group, UserGroup, UserGroupRoleOptions as UGRO } from '../../group/model'
import { groupHasActiveSubscription } from '../managerApi'

/**
 * Finds the group whose Pro subscription the current user can sponsor projects with.
 * Only MEMBER and GROUP_ADMIN memberships count; the primary group is checked first.
 * All groups are checked against the manager service in parallel; the first (in that order) with an active
 * subscription wins.
 *
 * @param ctx - request context
 * @returns the Pro group, or null when the user is anonymous, has no eligible group, or none is Pro
 * @example const group = await findCurrentUserProGroup(ctx) // Group | null
 */
export const findCurrentUserProGroup = async(ctx: Context): Promise<Group | null> => {
  const userId = ctx.user?.id
  if (!userId) {
    return null
  }
  const userGroups = await ctx.entityManager.getRepository(UserGroup).find({
    where: { userId, role: In([UGRO.MEMBER, UGRO.GROUP_ADMIN]) },
    order: { primary: 'DESC' },
    relations: ['group'],
  })
  // Checked in parallel so the 2 s per-request timeout does not add up; the primary-first order still decides.
  const isPro = await Promise.all(userGroups.map(userGroup => groupHasActiveSubscription(ctx, userGroup.groupId)))
  const proIndex = isPro.indexOf(true)
  return proIndex === -1 ? null : userGroups[proIndex].group
}
