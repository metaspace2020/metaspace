import {Context} from '../../../context';
import {UserProjectRole} from '../../../binding';
import {Project as ProjectModel, UserProject as UserProjectModel, UserProjectRoleOptions as UPRO} from '../model';
import {User as UserModel} from '../../user/model';
import {UserError} from "graphql-errors";
import {DatasetProject as DatasetProjectModel} from '../../dataset/model';
import updateProjectDatasets from './updateProjectDatasets';
import {ProjectSourceRepository} from '../ProjectSourceRepository';

export default async (ctx: Context, userId: string, projectId: string, newRole: UserProjectRole | null) => {
  const currentUserId = ctx.getUserIdOrFail();
  const userProjectRepository = ctx.connection.getRepository(UserProjectModel);
  const datasetProjectRepository = ctx.connection.getRepository(DatasetProjectModel);
  const user = await ctx.connection.getRepository(UserModel).findOne(userId);
  if (user == null) throw new UserError('User not found');

  const project = await ctx.connection.getCustomRepository(ProjectSourceRepository)
    .findProjectById(ctx.user, projectId);
  if (project == null) throw new UserError('Project not found');
  const projectMembers = await userProjectRepository.find({ where: { projectId } });

  const existingUserProject = projectMembers.find(up => up.userId === userId);
  const existingRole = existingUserProject != null ? existingUserProject.role : null;
  const currentUserUserProject = projectMembers.find(up => up.userId === currentUserId);
  const currentUserRole = currentUserUserProject != null ? currentUserUserProject.role : null;

  if (newRole === existingRole) return;

  // Validate
  if (!ctx.isAdmin) {
    type Transition = { from: UserProjectRole | null, to: UserProjectRole | null, allowedIf: () => Boolean };
    const allowedTransitions: Transition[] = [
      // Request access flow
      { from: null, to: UPRO.PENDING, allowedIf: () => currentUserId === userId },
      { from: UPRO.PENDING, to: null, allowedIf: () => currentUserId === userId || currentUserRole === UPRO.MANAGER },
      { from: UPRO.PENDING, to: UPRO.MEMBER, allowedIf: () => currentUserRole === UPRO.MANAGER },
      // Invitation flow
      { from: null, to: UPRO.INVITED, allowedIf: () => currentUserRole === UPRO.MANAGER },
      { from: UPRO.INVITED, to: null, allowedIf: () => currentUserId === userId || currentUserRole === UPRO.MANAGER },
      { from: UPRO.INVITED, to: UPRO.MEMBER, allowedIf: () => currentUserId === userId },
      // Leave / remove from group
      { from: UPRO.MEMBER, to: null, allowedIf: () => currentUserId === userId || currentUserRole === UPRO.MANAGER },
    ];
    const transition = allowedTransitions.find(t => t.from === existingRole && t.to === newRole);
    if (!transition || !transition.allowedIf()) {
      throw new UserError('Unauthorized');
    }
  }

  // Update DB
  if (existingUserProject == null) {
    await userProjectRepository.insert({userId, projectId, role: newRole!});
  } else if (newRole == null) {
    await userProjectRepository.delete({userId, projectId});
  } else {
    await userProjectRepository.update({userId, projectId}, {role: newRole});
  }

  // Update ProjectDatasets' "approved" status
  const datasetsToUpdate: {id: string}[] = await datasetProjectRepository.createQueryBuilder('datasetProject')
    .innerJoin('datasetProject.dataset', 'dataset')
    .where('dataset.userId = :userId', {userId})
    .andWhere('datasetProject.projectId = :projectId', {projectId})
    .select('dataset.id', 'id')
    .getRawMany();

  if (datasetsToUpdate.length > 0) {
    const datasetIds = datasetsToUpdate.map(({id}) => id);
    const approved = newRole == null
      ? null
      : [UPRO.MANAGER, UPRO.MEMBER].includes(newRole);
    await updateProjectDatasets(ctx, projectId, datasetIds, approved);
  }

  if (!ctx.isAdmin) {
    // TODO: Send emails
  }
};
