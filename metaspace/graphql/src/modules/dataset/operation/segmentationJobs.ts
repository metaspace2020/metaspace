import { EntityManager } from 'typeorm'
import { ImageSegmentationJob } from '../../engine/model'

/**
 * Finds the segmentation job whose results a viewer should see for a dataset.
 *
 * A signed-in viewer sees their latest FINISHED private (non-default) job; anyone without one, including
 * anonymous viewers, sees the latest FINISHED default job. Visibility of the dataset itself must be checked
 * by the caller.
 *
 * @param em - Entity manager to query with
 * @param datasetId - Dataset id
 * @param userId - Id of the viewer, or null for anonymous viewers
 * @returns The visible FINISHED job, or undefined when there is none
 * @example
 * const job = await findVisibleSegmentationJob(ctx.entityManager, datasetId, ctx.user.id || null)
 */
export const findVisibleSegmentationJob = async(
  em: EntityManager, datasetId: string, userId: string | null,
): Promise<ImageSegmentationJob | undefined> => {
  const latestFinished = () => em.createQueryBuilder(ImageSegmentationJob, 'j')
    .where('j.datasetId = :datasetId', { datasetId })
    .andWhere('j.status = :status', { status: 'FINISHED' })
    .orderBy('j.createdAt', 'DESC')
    .addOrderBy('j.id', 'DESC')
    .limit(1)

  if (userId != null) {
    const privateJob = await latestFinished()
      .andWhere('j.isDefault = false')
      .andWhere('j.userId = :userId', { userId })
      .getOne()
    if (privateJob != null) {
      return privateJob
    }
  }
  return latestFinished()
    .andWhere('j.isDefault = true')
    .getOne()
}

/**
 * Finds a specific segmentation job by id when a viewer may see it: it must belong to the dataset, be FINISHED,
 * and be either a default job or the viewer's own job. Visibility of the dataset itself must be checked by the
 * caller.
 *
 * @param em - Entity manager to query with
 * @param datasetId - Dataset id the job must belong to
 * @param jobId - Segmentation job id
 * @param userId - Id of the viewer, or null for anonymous viewers (who see default jobs only)
 * @returns The job, or undefined when it does not exist or is not visible to the viewer
 * @example
 * const job = await findSegmentationJobVisibleById(ctx.entityManager, datasetId, jobId, ctx.user.id || null)
 */
export const findSegmentationJobVisibleById = async(
  em: EntityManager, datasetId: string, jobId: number, userId: string | null,
): Promise<ImageSegmentationJob | undefined> => {
  const qb = em.createQueryBuilder(ImageSegmentationJob, 'j')
    .where('j.id = :jobId', { jobId })
    .andWhere('j.datasetId = :datasetId', { datasetId })
    .andWhere('j.status = :status', { status: 'FINISHED' })
  if (userId != null) {
    qb.andWhere('(j.isDefault = true OR j.userId = :userId)', { userId })
  } else {
    qb.andWhere('j.isDefault = true')
  }
  return qb.getOne()
}

/**
 * Lists the segmentation jobs of a dataset that a viewer may see: every default job plus the viewer's own jobs,
 * in any status, newest first. Visibility of the dataset itself must be checked by the caller.
 *
 * @param em - Entity manager to query with
 * @param datasetId - Dataset id
 * @param userId - Id of the viewer, or null for anonymous viewers (who see default jobs only)
 * @returns The visible jobs ordered by `createdAt` descending
 * @example
 * const jobs = await findJobsVisibleTo(ctx.entityManager, datasetId, ctx.user.id || null)
 */
export const findJobsVisibleTo = async(
  em: EntityManager, datasetId: string, userId: string | null,
): Promise<ImageSegmentationJob[]> => {
  const qb = em.createQueryBuilder(ImageSegmentationJob, 'j')
    .where('j.datasetId = :datasetId', { datasetId })
  if (userId != null) {
    qb.andWhere('(j.isDefault = true OR j.userId = :userId)', { userId })
  } else {
    qb.andWhere('j.isDefault = true')
  }
  return qb
    .orderBy('j.createdAt', 'DESC')
    .addOrderBy('j.id', 'DESC')
    .getMany()
}
