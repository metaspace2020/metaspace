import { EntityManager } from 'typeorm';
import { DatasetProject as DatasetProjectModel } from '../model';
import { PublicationStatusOptions as PSO } from '../../project/PublicationStatusOptions';
import { UserError } from 'graphql-errors';
import { PublicationStatus } from "../../../binding";


const fetchDsProjectsPublished = async (
  entityManager: EntityManager, datasetId: string, statuses: PublicationStatus[]
) => {
  return await entityManager.createQueryBuilder(DatasetProjectModel, 'dsProj')
    .leftJoinAndSelect('dsProj.project', 'proj')
    .where('dsProj.datasetId = :datasetId', { datasetId })
    .andWhere('proj.publicationStatus = ANY(:statuses)', { statuses })
    .getMany();
};

export const checkProjectsPublicationStatus = async (
  entityManager: EntityManager, datasetId: string, statuses: PublicationStatus[]
) => {
  const dsProjectPublished = (await fetchDsProjectsPublished(entityManager, datasetId, statuses))
    .find(pd => true);

  if (dsProjectPublished) {
    throw new UserError(JSON.stringify({
      type: 'under_review_or_published',
      message: `Cannot modify dataset ${datasetId} as it belongs to ${dsProjectPublished.projectId} project ` +
      ` in ${dsProjectPublished.project.publicationStatus} status`
    }));
  }
};

export const checkNoPublishedProjectRemoved = async (
  entityManager: EntityManager, datasetId: string, updatedProjectIds: string[]
) => {
  const removedDsProject = (
    await fetchDsProjectsPublished(entityManager, datasetId, [PSO.PUBLISHED, PSO.UNDER_REVIEW])
  ).find(dsProj => !updatedProjectIds.includes(dsProj.projectId));

  if (removedDsProject) {
    throw new UserError(JSON.stringify({
      type: 'under_review_or_published',
      message: `Cannot remove dataset ${datasetId} from ${removedDsProject.projectId} project ` +
      ` in ${removedDsProject.project.publicationStatus} status`
    }));
  }
};