import * as _ from 'lodash';
import {Context} from '../../../context';
import {Dataset as DatasetModel, DatasetProject as DatasetProjectModel} from '../../dataset/model';
import {smAPIRequest} from '../../../utils';
import {In} from 'typeorm';


export default async function (ctx: Context, projectId: string, datasetIds: string[], approved: Boolean | null) {
  const datasetProjectRepository = ctx.connection.getRepository(DatasetProjectModel);
  const datasets = await ctx.connection.getRepository(DatasetModel)
    .find({
      where: { id: In(datasetIds) },
      relations: ['datasetProjects'],
    });

  const promises = datasets.map(async dataset => {
    const existingDatasetProject = dataset.datasetProjects.find(dp => dp.projectId === projectId);
    const datasetId = dataset.id;
    if (approved == null) {
      if (existingDatasetProject != null) {
        await datasetProjectRepository.delete({ projectId, datasetId });
      } else {
        return; // No change needed
      }
    } else {
      if (existingDatasetProject != null && approved !== existingDatasetProject.approved) {
        await datasetProjectRepository.update({ projectId, datasetId }, {approved});
      } else if (existingDatasetProject == null) {
        await datasetProjectRepository.insert({ projectId, datasetId, approved });
      } else if (existingDatasetProject != null) {
        return; // No change needed
      }
    }

    const projectIds = dataset.datasetProjects.map(dp => dp.projectId);
    if (approved === true) {
      projectIds.push(projectId);
    } else {
      _.pull(projectIds, projectId);
    }

    await smAPIRequest(`/v1/datasets/${datasetId}/update`, { doc: { projectIds } });
  });

  await Promise.all(promises);
};
