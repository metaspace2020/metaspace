import { FieldResolversFor, ProjectSource, UserProjectSource } from '../../../bindingTypes'
import { UserProject } from '../../../binding'
import { Context } from '../../../context'
import { ProjectSourceRepository } from '../ProjectSourceRepository'
import { UserError } from 'graphql-errors'
import { Dataset as DatasetModel } from '../../dataset/model'

const UserProjectResolvers: FieldResolversFor<UserProject, UserProjectSource> = {
  async project(userProject, args, ctx: Context): Promise<ProjectSource> {
    const project = await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, userProject.projectId)

    if (project != null) {
      return project
    } else {
      throw new UserError('Project not found')
    }
  },
  async numDatasets(userProject, args, { entityManager, isAdmin, user }: Context): Promise<number> {
    // NOTE: This number includes private datasets. It is only secure because we *currently* only resolve
    // `UserProjectSource`s when you are in the same project as the user, and thus allowed to see the private datasets
    // that are also in that project.
    // If this assumption changes, we'll have to consider whether showing a number that includes private datasets is a privacy breach.
    const { userId, projectId } = userProject
    const canSeePrivateDatasets = isAdmin || (user && (await user.getMemberOfProjectIds()).includes(projectId))
    return await entityManager.getRepository(DatasetModel)
      .createQueryBuilder('dataset')
      .innerJoin('dataset.datasetProjects', 'datasetProject')
      .innerJoin('(SELECT * FROM "public"."dataset")', 'engine_dataset', 'dataset.id = engine_dataset.id')
      .where('dataset.userId = :userId', { userId })
      .andWhere('datasetProject.projectId = :projectId', { projectId })
      .andWhere('datasetProject.approved')
      .andWhere(canSeePrivateDatasets ? 'TRUE' : 'engine_dataset.is_public')
      .andWhere('engine_dataset.status != \'FAILED\'')
      .getCount()
  },
}

export default UserProjectResolvers
