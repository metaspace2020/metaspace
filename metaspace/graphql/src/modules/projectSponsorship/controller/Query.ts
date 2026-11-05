import { FieldResolversFor, ScopeRole } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { Context } from '../../../context'
import { assertCanAccessProject } from '../../experiment/operation/permissions'
import { getProjectSponsorship, SponsorshipRecord } from '../managerApi'
import { keysToEntitlements, ProjectEntitlement } from '../entitlements'
import { findCurrentUserProGroup } from '../operation/findCurrentUserProGroup'
import { Group } from '../../group/model'
import { resolveGroupScopeRole } from '../../group/util/resolveGroupScopeRole'
import logger from '../../../utils/logger'

/** Parent object passed to the `ProjectSponsorship` field resolvers. */
export interface ProjectSponsorshipSource {
  projectId: string
  proGroupId: string
  sponsorUserId: string
  entitlements: ProjectEntitlement[]
  createdAt: string
}

/**
 * Maps a manager-service sponsorship record to the GraphQL `ProjectSponsorship` source.
 *
 * @param rec - record returned by the manager service
 * @returns the source object, with entitlement keys converted to enum values (unknown keys dropped)
 * @example toSponsorshipSource({ ...rec, entitlements: ['diffAnalysis'] }).entitlements // ['DIFF_ANALYSIS']
 */
export const toSponsorshipSource = (rec: SponsorshipRecord): ProjectSponsorshipSource => ({
  projectId: rec.projectId,
  proGroupId: rec.proGroupId,
  sponsorUserId: rec.sponsorUserId,
  entitlements: keysToEntitlements(rec.entitlements),
  createdAt: rec.createdAt,
})

const QueryResolvers: FieldResolversFor<Query, void> = {
  /**
   * Returns the project's Pro sponsorship, or null when it has none.
   * Readable by admins and by project members, managers and reviewers.
   * Fails soft: a manager-service error (timeout, 5xx) is logged and resolves to null.
   */
  async projectSponsorship(source, { projectId }, ctx: Context): Promise<ProjectSponsorshipSource | null> {
    await assertCanAccessProject(ctx, projectId, { write: false })
    let record: SponsorshipRecord | null
    try {
      record = await getProjectSponsorship(ctx, projectId)
    } catch (error) {
      logger.error(`Fetching sponsorship for project ${projectId} failed: ${error}`)
      return null
    }
    return record != null ? toSponsorshipSource(record) : null
  },

  /**
   * Returns the group whose active Pro subscription the current user can sponsor projects with,
   * or null when there is none (or the user is not logged in).
   */
  async currentUserProGroup(source, args, ctx: Context): Promise<(Group & { scopeRole: ScopeRole }) | null> {
    const group = await findCurrentUserProGroup(ctx)
    if (group == null) {
      return null
    }
    // Group field resolvers (members, hasPendingRequest) read scopeRole from the source, as in Query.group.
    const scopeRole = await resolveGroupScopeRole(ctx, group.id)
    return { ...group, scopeRole }
  },
}

export default QueryResolvers
