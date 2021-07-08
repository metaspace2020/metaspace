import { DatasetProject as DatasetProjectModel } from '../model'
import { PublicationStatusOptions as PSO } from '../../project/Publishing'
import { UserError } from 'graphql-errors'
import { PublicationStatus } from '../../../binding'
import * as DataLoader from 'dataloader'
import { Context } from '../../../context'
import * as _ from 'lodash'
import { EntityManager } from 'typeorm'

const fetchDatasetProjectsInStatusUncached = async(
  entityManager: EntityManager, datasetIds: string[], statuses: PublicationStatus[]
) => {
  const rows = await entityManager.createQueryBuilder(DatasetProjectModel, 'dsProj')
    .leftJoinAndSelect('dsProj.project', 'proj')
    .where('dsProj.datasetId = ANY(:datasetIds)', { datasetIds })
    .andWhere('proj.publicationStatus = ANY(:statuses)', { statuses })
    .getMany()

  const groupedRows = _.groupBy(rows, 'datasetId')
  return datasetIds.map(id => groupedRows[id] || [])
}

const fetchDatasetProjectsInStatus = async(
  ctx: Context, datasetId: string, statuses: PublicationStatus[]
): Promise<DatasetProjectModel[]> => {
  const statusCacheKey = statuses.join(',')
  const dataLoader = ctx.contextCacheGet('fetchDatasetProjectsInStatusDataLoader', [statusCacheKey],
    (statusCacheKey) => {
      const statuses = statusCacheKey.split(',') as PublicationStatus[]
      return new DataLoader(
        (datasetIds: string[]) => fetchDatasetProjectsInStatusUncached(ctx.entityManager, datasetIds, statuses)
      )
    })
  return dataLoader.load(datasetId)
}

export const isDatasetInPublicationStatus = async(ctx: Context, datasetId: string, statuses: PublicationStatus[]) => {
  return (await fetchDatasetProjectsInStatus(ctx, datasetId, statuses)).length > 0
}

export const checkProjectsPublicationStatus = async(
  entityManager: EntityManager, datasetId: string, statuses: PublicationStatus[]
) => {
  const [dsProjectPublished] = (await fetchDatasetProjectsInStatusUncached(entityManager, [datasetId], statuses))
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
  const [dsProjects] = await fetchDatasetProjectsInStatusUncached(
    entityManager, [datasetId], [PSO.PUBLISHED, PSO.UNDER_REVIEW]
  )
  const removedDsProject = dsProjects.find(dsProj => !updatedProjectIds.includes(dsProj.projectId))

  if (removedDsProject) {
    throw new UserError(JSON.stringify({
      type: 'under_review_or_published',
      message: `Cannot remove dataset ${datasetId} from ${removedDsProject.projectId} project `
        + ` in ${removedDsProject.project.publicationStatus} status`,
    }))
  }
}
