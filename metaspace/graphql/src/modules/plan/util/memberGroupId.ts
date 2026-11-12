import { In } from 'typeorm'
import { Context } from '../../../context'
import { UserGroup, UserGroupRoleOptions as UGRO } from '../../group/model'

/**
 * Returns the group whose plan applies to actions the current user runs for themselves
 * (segmentation, diff analysis, experiments): their primary MEMBER/GROUP_ADMIN group.
 *
 * The manager service counts usage per (user, group), so these actions must report the user's own
 * group rather than the group that owns the dataset; otherwise every foreign group opens a fresh quota.
 *
 * @param ctx Request context.
 * @returns The group id, or undefined for anonymous users and users without a group.
 */
export const memberGroupId = async(ctx: Context): Promise<string | undefined> => {
  const userId = ctx.user.id
  if (userId == null) return undefined

  const userGroup = await ctx.entityManager.getRepository(UserGroup).findOne({
    where: { userId, role: In([UGRO.MEMBER, UGRO.GROUP_ADMIN]) },
    order: { primary: 'DESC' },
  })
  return userGroup?.groupId
}
