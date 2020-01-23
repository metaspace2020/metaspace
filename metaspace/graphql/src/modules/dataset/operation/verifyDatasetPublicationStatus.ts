import {EntityManager} from 'typeorm';
import {DatasetProject as DatasetProjectModel} from '../model';
import {PublicationStatusOptions as PSO} from '../../project/PublicationStatusOptions';
import {UserError} from 'graphql-errors';


export const verifyDatasetPublicationStatus = async (entityManager: EntityManager, datasetId: string) => {
  const dsPublishedInProject = (await entityManager.getRepository(DatasetProjectModel)
    .find({ datasetId }))
    .find(dp => dp.publicationStatus != PSO.UNPUBLISHED);
  if (dsPublishedInProject) {
    throw new UserError(`Cannot modify dataset ${datasetId} as it belongs to ${dsPublishedInProject.projectId} project ` +
      `which is in ${dsPublishedInProject.publicationStatus} status`);
  }
};