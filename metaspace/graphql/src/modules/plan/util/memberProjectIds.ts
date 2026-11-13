import { In } from 'typeorm'
import { Context } from '../../../context'
import { UserProject, UserProjectRoleOptions as UPRO } from '../../project/model'

/**
 * Returns the subset of candidate project ids in which the current user is a MEMBER or MANAGER.
 * Admins are filtered the same way: sponsorship depends on membership, not privilege.
 *
 * @param ctx Request context.
 * @param candidateProjectIds Project ids to filter; may be null/undefined.
 * @returns Deduplicated ids in original order; empty for anonymous users or empty input.
 */
export const memberProjectIds = async(
  ctx: Context, candidateProjectIds: ReadonlyArray<string> | null | undefined,
): Promise<string[]> => {
  const userId = ctx.user.id
  if (userId == null || candidateProjectIds == null) return []
  const candidateIds = Array.from(new Set(candidateProjectIds))
  if (candidateIds.length === 0) return []

  const rows = await ctx.entityManager.getRepository(UserProject).find({
    where: { userId, projectId: In(candidateIds), role: In([UPRO.MEMBER, UPRO.MANAGER]) },
  })
  const memberIds = new Set(rows.map(r => r.projectId))
  return candidateIds.filter(id => memberIds.has(id))
}
