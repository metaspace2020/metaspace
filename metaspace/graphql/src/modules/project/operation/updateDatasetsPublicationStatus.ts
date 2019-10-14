import {Context} from '../../../context';
import {DatasetProject as DatasetProjectModel} from '../../dataset/model';
import {PublicationStatusOptions} from '../model';
import {PublicationStatus} from '../../../binding';


export default async function (ctx: Context, projectId: string, publicationStatus: PublicationStatus) {
  const datasetProjectRepository = ctx.entityManager.getRepository(DatasetProjectModel);
  const affectedProjectDatasets = await ctx.entityManager.getRepository(DatasetProjectModel)
    .find({ projectId });
  await Promise.all(affectedProjectDatasets.map(async dp => {
    await datasetProjectRepository.update({ datasetId: dp.datasetId }, { publicationStatus });
  }));
};
