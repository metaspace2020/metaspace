import { UserError } from 'graphql-errors'
import { Context } from '../../../context'
import { UserProject as UserProjectModel, UserProjectRoleOptions as UPRO } from '../../project/model'

/**
 * Ensures the current user may manage the project's Pro sponsorship.
 * Admins always pass; other users need a `user_project` row with role MANAGER.
 *
 * @param ctx - request context
 * @param projectId - project to check
 * @throws UserError('Unauthenticated') when not logged in, UserError('Unauthorized') when not a manager
 */
export const assertProjectManager = async(ctx: Context, projectId: string): Promise<void> => {
  const userId = ctx.getUserIdOrFail()
  if (ctx.isAdmin) {
    return
  }
  const userProject = await ctx.entityManager.findOne(UserProjectModel, {
    where: { projectId, userId, role: UPRO.MANAGER },
  })
  if (userProject == null) {
    throw new UserError('Unauthorized')
  }
}
