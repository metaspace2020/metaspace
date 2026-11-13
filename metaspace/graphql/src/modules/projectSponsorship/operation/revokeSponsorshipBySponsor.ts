import { Context } from '../../../context'
import config from '../../../utils/config'
import logger from '../../../utils/logger'
import { deleteProjectSponsorship, getProjectSponsorship } from '../managerApi'

/**
 * Removes the project's  sponsorship when `userId` is the user who sponsored it. Used when a user leaves or is
 * removed from a project, so the features they shared stop being available once they are gone. Never throws: a
 * manager-service failure is logged and the membership change goes ahead.
 *
 * @param ctx - request context; its Authorization header is forwarded to the manager service
 * @param projectId - project the user is leaving
 * @param userId - user leaving the project
 * @returns true when a sponsorship by this user was removed
 */
export const revokeSponsorshipBySponsor = async(ctx: Context, projectId: string, userId: string): Promise<boolean> => {
  if (!config.manager_api_url) {
    return false
  }
  try {
    const sponsorship = await getProjectSponsorship(ctx, projectId)
    if (sponsorship == null || sponsorship.sponsorUserId !== userId) {
      return false
    }
    await deleteProjectSponsorship(ctx, projectId)
    logger.info(`Removed the sponsorship of project ${projectId} because its sponsor ${userId} left the project`)
    return true
  } catch (error) {
    logger.error(`Revoking the sponsorship of project ${projectId} for leaving user ${userId} failed: ${error}`)
    return false
  }
}
