import { UserError } from 'graphql-errors'
import { FieldResolversFor } from '../../../bindingTypes'
import { Mutation } from '../../../binding'
import { Context } from '../../../context'
import { assertProjectManager } from '../operation/assertProjectManager'
import {
  deleteProjectSponsorship, ManagerApiHttpError, NOT_AVAILABLE, putProjectSponsorship, SponsorshipRecord,
} from '../managerApi'
import { findCurrentUserProGroup } from '../operation/findCurrentUserProGroup'
import { entitlementsToKeys } from '../entitlements'
import { ProjectSponsorshipSource, toSponsorshipSource } from './Query'
import logger from '../../../utils/logger'

const MutationResolvers: FieldResolversFor<Mutation, void> = {
  /**
   * Sponsors the project with the current user's Pro group, granting the given entitlements.
   * Project managers and admins only; replaces any existing sponsorship.
   *
   * @throws UserError('Unauthorized') when the caller is not a project manager
   * @throws UserError('Select at least one entitlement') when `entitlements` is empty
   * @throws UserError('You need an active Pro group to sponsor a project') when the caller has no Pro group
   * @throws UserError with the manager service's message when it answers with a non-2xx status
   * @throws UserError('Pro sponsorship is not available') when the manager service is unreachable or not configured
   */
  async setProjectSponsorship(source, args, ctx: Context): Promise<ProjectSponsorshipSource> {
    const projectId: string = args.projectId
    const entitlements = args.entitlements
    await assertProjectManager(ctx, projectId)
    if (entitlements.length === 0) {
      throw new UserError('Select at least one entitlement')
    }
    const group = await findCurrentUserProGroup(ctx)
    if (group == null) {
      throw new UserError('You need an active Pro group to sponsor a project')
    }
    let record: SponsorshipRecord
    try {
      record = await putProjectSponsorship(ctx, projectId, group.id, entitlementsToKeys(entitlements))
    } catch (error) {
      if (error instanceof ManagerApiHttpError) {
        throw new UserError(error.message)
      }
      // Network/timeout errors carry internal URLs; log them and show a generic message instead.
      logger.error(`Setting sponsorship for project ${projectId} failed: ${error}`)
      throw new UserError(NOT_AVAILABLE)
    }
    return toSponsorshipSource(record)
  },

  /**
   * Removes the project's Pro sponsorship. Project managers and admins only.
   * Returns true also when the project had no sponsorship.
   *
   * @throws UserError('Unauthorized') when the caller is not a project manager
   * @throws UserError with the manager service's message when it answers with a non-2xx, non-404 status
   * @throws UserError('Pro sponsorship is not available') when the manager service is unreachable or not configured
   */
  async removeProjectSponsorship(source, { projectId }, ctx: Context): Promise<boolean> {
    await assertProjectManager(ctx, projectId)
    try {
      return await deleteProjectSponsorship(ctx, projectId)
    } catch (error) {
      if (error instanceof ManagerApiHttpError) {
        throw new UserError(error.message)
      }
      // Network/timeout errors carry internal URLs; log them and show a generic message instead.
      logger.error(`Removing sponsorship for project ${projectId} failed: ${error}`)
      throw new UserError(NOT_AVAILABLE)
    }
  },
}

export default MutationResolvers
