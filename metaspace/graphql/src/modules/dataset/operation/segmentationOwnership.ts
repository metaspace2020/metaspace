import { EntityManager } from 'typeorm'
import { UserError } from 'graphql-errors'
import { ImageSegmentationJob, Segmentation } from '../../engine/model'
import { DatasetSource } from '../../../bindingTypes'
import { Context } from '../../../context'
import canEditEsDataset from './canEditEsDataset'

/** Job statuses that mean a segmentation run is still queued or running. */
export const LIVE_JOB_STATUSES = ['QUEUED', 'STARTED']

/**
 * Builds a query for the jobs in one "slot" of a dataset: the shared default slot, or the caller's private slot.
 *
 * @param em - Entity manager to query with
 * @param datasetId - Dataset id
 * @param isDefault - True for the default slot, false for the caller's private slot
 * @param userId - Id of the caller (only used for the private slot)
 * @returns A query builder over `image_segmentation_job` aliased as `j`
 */
const slotQuery = (em: EntityManager, datasetId: string, isDefault: boolean, userId: string) => {
  const qb = em.createQueryBuilder(ImageSegmentationJob, 'j')
    .where('j.datasetId = :datasetId', { datasetId })
  if (isDefault) {
    qb.andWhere('j.isDefault = true')
  } else {
    qb.andWhere('j.isDefault = false')
      .andWhere('j.userId = :userId', { userId })
  }
  return qb
}

/**
 * Finds a QUEUED or STARTED job in a dataset slot.
 *
 * @param em - Entity manager to query with
 * @param datasetId - Dataset id
 * @param isDefault - True for the default slot, false for the caller's private slot
 * @param userId - Id of the caller
 * @returns The live job, or undefined when the slot is idle
 * @example
 * if (await findLiveJobInSlot(em, dsId, true, ctx.user.id)) throw new UserError('...')
 */
export const findLiveJobInSlot = async(
  em: EntityManager, datasetId: string, isDefault: boolean, userId: string,
): Promise<ImageSegmentationJob | undefined> => {
  return slotQuery(em, datasetId, isDefault, userId)
    .andWhere('j.status IN (:...statuses)', { statuses: LIVE_JOB_STATUSES })
    .orderBy('j.createdAt', 'DESC')
    .addOrderBy('j.id', 'DESC')
    .limit(1)
    .getOne()
}

/**
 * Finds the latest FINISHED job in a dataset slot, i.e. the one a new run in that slot would replace.
 *
 * @param em - Entity manager to query with
 * @param datasetId - Dataset id
 * @param isDefault - True for the default slot, false for the caller's private slot
 * @param userId - Id of the caller
 * @returns The latest finished job, or undefined when there is none
 * @example
 * const previous = await findFinishedJobInSlot(em, dsId, false, ctx.user.id)
 */
export const findFinishedJobInSlot = async(
  em: EntityManager, datasetId: string, isDefault: boolean, userId: string,
): Promise<ImageSegmentationJob | undefined> => {
  return slotQuery(em, datasetId, isDefault, userId)
    .andWhere('j.status = :status', { status: 'FINISHED' })
    .orderBy('j.createdAt', 'DESC')
    .addOrderBy('j.id', 'DESC')
    .limit(1)
    .getOne()
}

/**
 * Finds an experiment whose regions reference any segment of a job.
 *
 * @param em - Entity manager to query with
 * @param jobId - Segmentation job id
 * @returns The name of one such experiment, or null when the job's segments are unused
 * @example
 * const name = await experimentNameUsingJob(em, job.id)
 */
export const experimentNameUsingJob = async(em: EntityManager, jobId: number): Promise<string | null> => {
  const segments = await em.find(Segmentation, { select: ['id'], where: { jobId } })
  if (segments.length === 0) {
    return null
  }
  const rows: { name: string }[] = await em.query(
    `SELECT e.name FROM public.experiment_dataset ed
     JOIN public.experiment e ON e.id = ed.experiment_id
     WHERE EXISTS (
       SELECT 1 FROM jsonb_array_elements(ed.regions) r WHERE r->>'segmentationId' = ANY($1)
     )
     LIMIT 1`,
    [segments.map(s => s.id)],
  )
  return rows.length > 0 ? rows[0].name : null
}

/**
 * Rejects replacing or deleting a job whose segments are referenced by an experiment.
 *
 * @param em - Entity manager to query with
 * @param job - The job about to be replaced or deleted
 * @throws UserError naming the experiment that uses the job
 * @example
 * await assertJobNotInUse(ctx.entityManager, job)
 */
export const assertJobNotInUse = async(em: EntityManager, job: ImageSegmentationJob): Promise<void> => {
  const experimentName = await experimentNameUsingJob(em, job.id)
  if (experimentName != null) {
    throw new UserError(
      `This segmentation is used by experiment "${experimentName}"; remove it from the experiment first`
    )
  }
}

/**
 * Decides whether the caller may rename or delete a job's results: owners manage their private jobs,
 * dataset editors manage the default job.
 *
 * @param job - The segmentation job
 * @param dataset - The job's dataset as returned by `esDatasetByID`
 * @param ctx - Request context
 * @returns True when the caller may manage the job
 * @example
 * if (!(await canManageSegmentationJob(job, dataset, ctx))) throw new UserError('...')
 */
export const canManageSegmentationJob = async(
  job: Pick<ImageSegmentationJob, 'isDefault' | 'userId'>, dataset: DatasetSource, ctx: Context,
): Promise<boolean> => {
  if (!job.isDefault) {
    return ctx.user.id != null && job.userId === ctx.user.id
  }
  return await canEditEsDataset(dataset, ctx)
}
