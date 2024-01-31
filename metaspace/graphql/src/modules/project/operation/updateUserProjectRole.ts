import { Context } from '../../../context'
import { UserProjectRole } from '../../../binding'
import { UserProject as UserProjectModel, UserProjectRoleOptions as UPRO } from '../model'
import { User as UserModel } from '../../user/model'
import { UserError } from 'graphql-errors'
import { DatasetProject as DatasetProjectModel } from '../../dataset/model'
import updateProjectDatasets from './updateProjectDatasets'
import { ProjectSourceRepository } from '../ProjectSourceRepository'
import logger from '../../../utils/logger'

export default async(ctx: Context, userId: string, projectId: string, newRole: UserProjectRole | null) => {
  const currentUserId = ctx.getUserIdOrFail()
  const userProjectRepository = ctx.entityManager.getRepository(UserProjectModel)
  const datasetProjectRepository = ctx.entityManager.getRepository(DatasetProjectModel)
  const user = await ctx.entityManager.getRepository(UserModel).findOne(userId)
  if (user == null) throw new UserError('User not found')

  const project = await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
    .findProjectById(ctx.user, projectId)
  if (project == null) throw new UserError('Project not found')
  const projectMembers = await userProjectRepository.find({ where: { projectId } })

  const existingUserProject = projectMembers.find(up => up.userId === userId)
  const existingRole = existingUserProject != null ? existingUserProject.role : null
  const currentUserUserProject = projectMembers.find(up => up.userId === currentUserId)
  const currentUserRole = currentUserUserProject != null ? currentUserUserProject.role : null

  if (newRole === existingRole) return

  // Validate
  if (!ctx.isAdmin) {
    /* eslint-disable max-len */
    type Transition = { from: UserProjectRole | null, to: UserProjectRole | null, allowedIf: () => boolean };
    const allowedTransitions: Transition[] = [
      // Request access flow
      { from: null, to: UPRO.PENDING, allowedIf: () => currentUserId === userId },
      { from: UPRO.PENDING, to: null, allowedIf: () => currentUserId === userId || currentUserRole === UPRO.MANAGER },
      { from: UPRO.PENDING, to: UPRO.MEMBER, allowedIf: () => currentUserRole === UPRO.MANAGER },
      // Invitation flow
      { from: null, to: UPRO.INVITED, allowedIf: () => currentUserRole === UPRO.MANAGER },
      { from: UPRO.INVITED, to: null, allowedIf: () => currentUserId === userId || currentUserRole === UPRO.MANAGER },
      { from: UPRO.INVITED, to: UPRO.MEMBER, allowedIf: () => currentUserId === userId },
      // Leave / remove from project
      { from: UPRO.MEMBER, to: null, allowedIf: () => currentUserId === userId || currentUserRole === UPRO.MANAGER },
      // Admin / manager creation
      { from: UPRO.MEMBER, to: UPRO.MANAGER, allowedIf: () => currentUserId !== userId && currentUserRole === UPRO.MANAGER },
      { from: UPRO.MANAGER, to: UPRO.MEMBER, allowedIf: () => currentUserId !== userId && currentUserRole === UPRO.MANAGER },
      { from: UPRO.MANAGER, to: null, allowedIf: () => currentUserId !== userId && currentUserRole === UPRO.MANAGER },
    ]
    /* eslint-enable max-len */
    const transition = allowedTransitions.find(t => t.from === existingRole && t.to === newRole && t.allowedIf())
    if (!transition) {
      throw new UserError('Unauthorized')
    }
  }

  // Update DB
  if (existingUserProject == null) {
    await userProjectRepository.insert({ userId, projectId, role: newRole! })
  } else if (newRole == null) {
    logger.info(`User ${userId} removed from project ${projectId}.`)
    await userProjectRepository.delete({ userId, projectId })
  } else {
    await userProjectRepository.update({ userId, projectId }, { role: newRole })
  }

  // Update ProjectDatasets' "approved" status
  const datasetsToUpdate: {id: string}[] = await datasetProjectRepository.createQueryBuilder('datasetProject')
    .innerJoin('datasetProject.dataset', 'dataset')
    .where('dataset.userId = :userId', { userId })
    .andWhere('datasetProject.projectId = :projectId', { projectId })
    .select('dataset.id', 'id')
    .getRawMany()

  if (datasetsToUpdate.length > 0) {
    const datasetIds = datasetsToUpdate.map(({ id }) => id)
    const approved = newRole == null
      ? true // keep datasets in project even if user removed
      : [UPRO.MANAGER, UPRO.MEMBER].includes(newRole)
    await updateProjectDatasets(ctx, projectId, datasetIds, [], approved)
  }
}
