import { Context } from '../../../context'
import logger from '../../../utils/logger'
import { getProjectSponsorship, SponsorshipRecord } from '../managerApi'
import { ENTITLEMENT_KEYS } from '../entitlements'

/**
 * Looks up a project's sponsorship once per request context. Any failure (404 aside, which is already null,
 * HTTP errors, timeouts, network errors) resolves null so callers fail closed.
 */
export const getProjectSponsorshipCached = (ctx: Context, projectId: string): Promise<SponsorshipRecord | null> =>
  ctx.contextCacheGet('projectSponsorship', [projectId], async(id: string) => {
    try {
      return await getProjectSponsorship(ctx, id)
    } catch (error) {
      logger.warn(`Fetching sponsorship for project ${id} failed: ${error}`)
      return null
    }
  })

/**
 * True when the current user is a MEMBER or MANAGER of one of the candidate projects and that project has an
 * active sponsorship with the private_resubmission entitlement whose sponsor is the dataset's submitter.
 *
 * @param ctx - request context
 * @param datasetSubmitterId - id of the user who owns the dataset
 * @param candidateProjectIds - projects the dataset belongs to
 * @returns false when no project qualifies or the manager service cannot confirm it
 */
export const hasSponsoredEditAccess = async(
  ctx: Context, datasetSubmitterId: string, candidateProjectIds: ReadonlyArray<string> | null | undefined,
): Promise<boolean> => {
  if (datasetSubmitterId == null || candidateProjectIds == null || candidateProjectIds.length === 0) return false
  // memoised per request, so list and annotation pages do not query UserProject once per row
  const memberIds = new Set(await ctx.user.getMemberOfProjectIds())
  const projectIds = Array.from(new Set(candidateProjectIds)).filter(id => memberIds.has(id))
  for (const projectId of projectIds) {
    const sponsorship = await getProjectSponsorshipCached(ctx, projectId)
    if (sponsorship != null
      && sponsorship.isActive
      && Array.isArray(sponsorship.entitlements)
      && sponsorship.entitlements.includes(ENTITLEMENT_KEYS.PRIVATE_RESUBMISSION)
      && sponsorship.sponsorUserId === datasetSubmitterId) {
      return true
    }
  }
  return false
}
