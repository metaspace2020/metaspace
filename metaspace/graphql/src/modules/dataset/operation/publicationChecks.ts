import { EntityManager } from 'typeorm'
import { DatasetProject as DatasetProjectModel } from '../model'
import { PublicationStatusOptions as PSO } from '../../project/Publishing'
import { UserError } from 'graphql-errors'
import { PublicationStatus } from '../../../binding'

const fetchDatasetProjectsInStatus = async(
  entityManager: EntityManager, datasetId: string, statuses: PublicationStatus[]
) => {
  return await entityManager.createQueryBuilder(DatasetProjectModel, 'dsProj')
    .leftJoinAndSelect('dsProj.project', 'proj')
    .where('dsProj.datasetId = :datasetId', { datasetId })
    .andWhere('proj.publicationStatus = ANY(:statuses)', { statuses })
    .getMany()
}

export const checkProjectsPublicationStatus = async(
  entityManager: EntityManager, datasetId: string, statuses: PublicationStatus[]
) => {
  const dsProjectPublished = await fetchDatasetProjectsInStatus(entityManager, datasetId, statuses)
  if (dsProjectPublished.length > 0) {
    const projectStatusList = dsProjectPublished
      .map(dp => ({ projectId: dp.projectId, status: dp.project.publicationStatus }))
    throw new UserError(JSON.stringify({
      type: 'under_review_or_published',
      message: `Cannot modify dataset ${datasetId}, it belongs to projects: ${JSON.stringify(projectStatusList)}`,
    }))
  }
}

export const checkNoPublishedProjectRemoved = async(
  entityManager: EntityManager, datasetId: string, updatedProjectIds: string[]
) => {
  const removedDsProject = (
    await fetchDatasetProjectsInStatus(entityManager, datasetId, [PSO.PUBLISHED, PSO.UNDER_REVIEW])
  ).find(dsProj => !updatedProjectIds.includes(dsProj.projectId))

  if (removedDsProject) {
    throw new UserError(JSON.stringify({
      type: 'under_review_or_published',
      message: `Cannot remove dataset ${datasetId} from ${removedDsProject.projectId} project `
        + ` in ${removedDsProject.project.publicationStatus} status`,
    }))
  }
}
