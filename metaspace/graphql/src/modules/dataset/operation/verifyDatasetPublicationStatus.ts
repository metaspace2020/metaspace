import {EntityManager} from 'typeorm';
import {ContextUser} from '../../../context';
import {DeleteDatasetArgs} from '../../../utils/smAPI';
import {DatasetProject as DatasetProjectModel, DatasetProject} from '../model';
import {PublicationStatusOptions} from '../../project/model';


export const verifyDatasetPublicationStatus = async (entityManager: EntityManager, dsId: string) => {
  const dsPublishedInProject = (await entityManager.getRepository(DatasetProjectModel)
    .find({ datasetId: dsId }))
    .find(dp => dp.publicationStatus != PublicationStatusOptions.UNPUBLISHED);
  if (dsPublishedInProject) {
    throw Error(`Dataset ${dsId} is in ${dsPublishedInProject.projectId} project ` +
      `which is in ${dsPublishedInProject.publicationStatus} status`);
  }
};