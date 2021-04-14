import * as _ from 'lodash'
import { Context } from '../../../context'
import { Dataset as DatasetModel, DatasetProject as DatasetProjectModel } from '../../dataset/model'
import { In } from 'typeorm'
import { smApiUpdateDataset } from '../../../utils/smApi/datasets'

export default async function(ctx: Context, projectId: string, datasetIds: string[],
  removedDatasetIds: string[], approved: boolean | null,
  asyncEsUpdate = true) {
  // add and update
  if (datasetIds != null && datasetIds.length > 0) {
    const datasetProjectRepository = ctx.entityManager.getRepository(DatasetProjectModel)
    const datasets = await ctx.entityManager.getRepository(DatasetModel)
      .find({
        where: { id: In(datasetIds) },
        relations: ['datasetProjects'],
      })

    const promises = datasets.map(async(dataset: any) => {
      const existingDatasetProject = dataset.datasetProjects.find((dp: any) => dp.projectId === projectId)
      const datasetId = dataset.id
      if (approved == null) {
        if (existingDatasetProject != null) {
          await datasetProjectRepository.delete({ projectId, datasetId })
        } else {
          return // No change needed
        }
      } else {
        if (existingDatasetProject != null && approved !== existingDatasetProject.approved) {
          await datasetProjectRepository.update({ projectId, datasetId }, { approved })
        } else if (existingDatasetProject == null) {
          await datasetProjectRepository.insert({ projectId, datasetId, approved })
        } else if (existingDatasetProject != null) {
          return // No change needed
        }
      }

      const projectIds = dataset.datasetProjects.map((dp : any) => dp.projectId)
      if (approved === true) {
        projectIds.push(projectId)
      } else {
        _.pull(projectIds, projectId)
      }

      await smApiUpdateDataset(datasetId, { projectIds }, { asyncEsUpdate })
    })

    await Promise.all(promises)
  }

  // remove relationships
  if (removedDatasetIds != null && removedDatasetIds.length > 0) {
    const datasetProjectRepository = ctx.entityManager.getRepository(DatasetProjectModel)
    const datasets = await ctx.entityManager.getRepository(DatasetModel)
      .find({
        where: { id: In(removedDatasetIds) },
        relations: ['datasetProjects'],
      })

    const promises = datasets.map(async(dataset : any) => {
      const existingDatasetProject = dataset.datasetProjects.find((dp : any) => dp.projectId === projectId)
      const datasetId = dataset.id

      if (existingDatasetProject) {
        await datasetProjectRepository.delete({ projectId, datasetId })

        const projectIds = dataset.datasetProjects.map((dp : any) => dp.projectId)
        _.pull(projectIds, projectId)

        await smApiUpdateDataset(datasetId, { projectIds }, { asyncEsUpdate })
      }
    })

    await Promise.all(promises)
  }
}
