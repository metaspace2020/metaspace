import { EntityManager } from 'typeorm'
import * as graphqlErrors from 'graphql-errors'
import { UserError } from 'graphql-errors'
import { Context } from '../../../context'
import { DatasetUpdateInput } from '../../../binding'
import { Dataset as DatasetModel, DatasetProject } from '../model'
import { EngineDataset } from '../../engine/model'
import { getDatasetForEditing } from './getDatasetForEditing'
import { hasSponsoredEditAccess } from '../../projectSponsorship/operation/hasSponsoredEditAccess'

// graphql-errors is compiled to ES5, so `instanceof UserError` is always false; it marks its errors with this symbol.
const IS_USER_ERROR: symbol = (graphqlErrors as any).IsUserError
const isAccessDenied = (error: any) =>
  error != null && error[IS_USER_ERROR] === true && error.message === 'Access denied'

export const SPONSORED_FIELD_LOCK_MESSAGE =
  'Only the dataset owner can change its group, projects, principal investigator or visibility'

/**
 * Like `getDatasetForEditing` with edit access, but when that denies access it also accepts a project member whose
 * project is sponsored with `private_resubmission` by the dataset's owner (approved project links only).
 *
 * @param ctx - request context
 * @param dsId - dataset id
 * @returns the dataset, and `sponsored: true` when access was granted only through the sponsorship
 * @throws the original `getDatasetForEditing` error when neither path grants access
 */
export const getDatasetForSponsoredEditing = async(
  ctx: Context, dsId: string,
): Promise<{ dataset: DatasetModel, sponsored: boolean }> => {
  try {
    const dataset = await getDatasetForEditing(ctx.entityManager, ctx.user, dsId)
    return { dataset, sponsored: false }
  } catch (error) {
    if (!isAccessDenied(error) || ctx.user.id == null) {
      throw error
    }
    const dataset = await ctx.entityManager.getRepository(DatasetModel).findOne({ id: dsId })
    if (dataset == null) {
      throw error
    }
    const approvedProjectIds = (await ctx.entityManager.getRepository(DatasetProject)
      .find({ datasetId: dsId, approved: true })).map(dp => dp.projectId)
    if (await hasSponsoredEditAccess(ctx, dataset.userId, approvedProjectIds)) {
      return { dataset, sponsored: true }
    }
    throw error
  }
}

const sameIdSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) => {
  const sortedA = Array.from(new Set(a)).sort()
  const sortedB = Array.from(new Set(b)).sort()
  return sortedA.length === sortedB.length && sortedA.every((id, i) => id === sortedB[i])
}

/**
 * Refuses a sponsored update that would change the dataset's submitter, group, projects, principal investigator or
 * visibility. Fields are compared against their current values, so resending an unchanged value is allowed.
 *
 * @param entityManager - entity manager to read the current values with
 * @param dataset - the dataset being updated
 * @param update - the requested update
 * @throws UserError with `SPONSORED_FIELD_LOCK_MESSAGE` when a locked field would change
 */
export const assertSponsoredUpdateAllowed = async(
  entityManager: EntityManager, dataset: DatasetModel, update: DatasetUpdateInput,
): Promise<void> => {
  let changed = (update.groupId !== undefined && update.groupId !== dataset.groupId)
    || (update.submitterId !== undefined && update.submitterId !== dataset.userId)

  if (!changed && update.principalInvestigator !== undefined) {
    const pi = update.principalInvestigator
    changed = pi === null
      ? dataset.piName != null || dataset.piEmail != null
      : pi.name !== dataset.piName || pi.email !== dataset.piEmail
  }

  if (!changed && update.isPublic !== undefined) {
    const engineDataset = await entityManager.findOne(EngineDataset, dataset.id)
    changed = engineDataset == null || update.isPublic !== engineDataset.isPublic
  }

  if (!changed && update.projectIds != null) {
    const requested = (Array.isArray(update.projectIds) ? update.projectIds : [update.projectIds]) as string[]
    const current = (await entityManager.find(DatasetProject, { datasetId: dataset.id })).map(dp => dp.projectId)
    changed = !sameIdSet(requested, current)
  }

  if (changed) {
    throw new UserError(SPONSORED_FIELD_LOCK_MESSAGE)
  }
}
