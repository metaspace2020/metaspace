import {Context} from '../../../context';
import {Project as ProjectModel, UserProject as UserProjectModel, UserProjectRoleOptions as UPRO} from '../model';
import {UserError} from 'graphql-errors';
import {FieldResolversFor, ProjectSource, ScopeRoleOptions as SRO, UserProjectSource} from '../../../bindingTypes';
import {Mutation} from '../../../binding';
import {ProjectSourceRepository} from '../ProjectSourceRepository';
import {DatasetProject as DatasetProjectModel} from '../../dataset/model';
import updateUserProjectRole from '../operation/updateUserProjectRole';
import {convertUserToUserSource} from '../../user/util/convertUserToUserSource';
import {createInactiveUser} from '../../auth/operation';
import updateProjectDatasets from '../operation/updateProjectDatasets';
import {User as UserModel} from '../../user/model';
import config from '../../../utils/config';
import {sendInvitationEmail} from '../../auth';
import {findUserByEmail} from '../../../utils';
import {sendProjectAcceptanceEmail, sendProjectInvitationEmail, sendRequestAccessToProjectEmail} from '../email';

const asyncAssertCanEditProject = async (ctx: Context, projectId: string) => {
  const userProject = await ctx.connection.getRepository(UserProjectModel).findOne({
    where: { projectId, userId: ctx.getUserIdOrFail(), role: UPRO.MANAGER },
  });
  if (!ctx.isAdmin && userProject == null) {
    throw new UserError('Unauthorized');
  }
};
const MutationResolvers: FieldResolversFor<Mutation, void> = {
  async createProject(source, { projectDetails }, ctx): Promise<ProjectSource> {
    const userId = ctx.getUserIdOrFail(); // Exit early if not logged in
    const { name, isPublic, urlSlug } = projectDetails;
    if (!ctx.isAdmin && urlSlug != null) {
      throw new UserError('urlSlug can only be set by METASPACE administrators');
    }

    const projectRepository = ctx.connection.getRepository(ProjectModel);
    const newProject = projectRepository.create({ name, isPublic, urlSlug });
    await projectRepository.insert(newProject);
    await ctx.connection.getRepository(UserProjectModel)
      .insert({
        projectId: newProject.id,
        userId: ctx.user!.id,
        role: UPRO.MANAGER,
      });
    const project = await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, newProject.id);
    if (project != null) {
      return project;
    } else {
      throw Error(`Project became invisible to user after create ${newProject.id}`);
    }
  },

  async updateProject(source, { projectId, projectDetails }, ctx): Promise<ProjectSource> {
    await asyncAssertCanEditProject(ctx, projectId);
    if (projectDetails.urlSlug !== undefined && !ctx.isAdmin) {
      throw new UserError('urlSlug can only be set by METASPACE administrators');
    }

    const projectRepository = ctx.connection.getRepository(ProjectModel);
    await projectRepository.update(projectId, projectDetails);
    const project = await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId);
    if (project != null) {
      return project;
    } else {
      throw Error(`Project became invisible to user after update ${projectId}`);
    }
  },

  async deleteProject(source, { projectId }, ctx): Promise<Boolean> {
    await asyncAssertCanEditProject(ctx, projectId);

    await ctx.connection.getRepository(DatasetProjectModel).delete({ projectId });
    await ctx.connection.getRepository(UserProjectModel).delete({ projectId });
    await ctx.connection.getRepository(ProjectModel).delete({ id: projectId });

    return true;
  },

  async leaveProject(source, { projectId }, ctx: Context): Promise<Boolean> {
    await updateUserProjectRole(ctx, ctx.getUserIdOrFail(), projectId, null);
    return true;
  },

  async removeUserFromProject(source, { projectId, userId }, ctx): Promise<Boolean> {
    await updateUserProjectRole(ctx, userId, projectId, null);

    return true;
  },

  async requestAccessToProject(source, { projectId }, ctx): Promise<UserProjectSource> {
    const userId = ctx.getUserIdOrFail();
    await updateUserProjectRole(ctx, userId, projectId, UPRO.PENDING);
    const userProject = await ctx.connection.getRepository(UserProjectModel)
      .findOneOrFail({ userId, projectId }, { relations: ['user', 'project'] });

    const managers = await ctx.connection.getRepository(UserProjectModel)
      .find({where: {projectId, role: UPRO.MANAGER}, relations: ['user'] });
    managers.forEach(manager => {
      sendRequestAccessToProjectEmail(manager.user, userProject.user, userProject.project);
    });

    // NOTE: In the return value, some role-dependent fields like `userProject.project.currentUserRole` will still reflect
    // the user's role before the request was made. The UI currently doesn't rely on the result, but if it does,
    // it may be necessary to make a way to update the cached ctx.getUserProjectRoles() value
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) };
  },

  async acceptRequestToJoinProject(source, { projectId, userId }, ctx: Context): Promise<UserProjectSource> {
    await updateUserProjectRole(ctx, userId, projectId, UPRO.MEMBER);
    const userProject = await ctx.connection.getRepository(UserProjectModel)
      .findOneOrFail({ userId, projectId }, { relations: ['user', 'project'] });

    sendProjectAcceptanceEmail(userProject.user, userProject.project);

    // NOTE: This return value has the same issue with role-dependent fields as `requestAccessToProject`
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) };
  },

  async inviteUserToProject(source, { projectId, email }, ctx: Context): Promise<UserProjectSource> {
    let user = await findUserByEmail(ctx.connection, email)
      || await findUserByEmail(ctx.connection, email, 'not_verified_email');
    const currentUser = await ctx.connection.getRepository(UserModel).findOneOrFail(ctx.getUserIdOrFail());
    if (user == null) {
      user = await createInactiveUser(email);
      const link = `${config.web_public_url}/account/create-account`;
      sendInvitationEmail(email, currentUser.name || '', link);
    } else {
      const project = await ctx.connection.getRepository(ProjectModel).findOneOrFail(projectId);
      sendProjectInvitationEmail(user, currentUser, project);
    }
    const userId = user.id;

    await updateUserProjectRole(ctx, userId, projectId, UPRO.INVITED);

    const userProject = await ctx.connection.getRepository(UserProjectModel)
      .findOneOrFail({ userId, projectId }, { relations: ['user'] });
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) };
  },

  async acceptProjectInvitation(source, { projectId }, ctx): Promise<UserProjectSource> {
    const userId = ctx.getUserIdOrFail();
    await updateUserProjectRole(ctx, userId, projectId, UPRO.MEMBER);
    const userProject = await ctx.connection.getRepository(UserProjectModel)
      .findOneOrFail({ userId, projectId }, { relations: ['user'] });
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) };
  },

  async importDatasetsIntoProject(source, { projectId, datasetIds }, ctx): Promise<Boolean> {
    const userProjectRole = (await ctx.getCurrentUserProjectRoles())[projectId];
    if (userProjectRole == null) {
      throw new UserError('Not a member of project');
    }
    if (datasetIds.length > 0) {
      const approved = [UPRO.MEMBER, UPRO.MANAGER].includes(userProjectRole);
      await updateProjectDatasets(ctx, projectId, datasetIds, approved);
    }

    return true;
  },
};

export default MutationResolvers;
