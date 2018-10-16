import {IResolvers} from 'graphql-tools';
import {UserError} from 'graphql-errors';
import {Mutation, Project, Query, UserProject, UserProjectRole} from '../../binding';
import {
  FieldResolversFor,
  ProjectSource,
  ScopeRole,
  ScopeRoleOptions as SRO,
  UserProjectSource,
} from '../../bindingTypes';
import {Context} from '../../context';
import {Project as ProjectModel, UserProject as UserProjectModel, UserProjectRoleOptions as UPRO} from './model';
import {Dataset as DatasetModel, DatasetProject as DatasetProjectModel} from '../dataset/model';
import {findUserByEmail} from '../auth/operation';
import updateUserProjectRole from './operation/updateUserProjectRole';
import {convertUserToUserSource} from '../user/util/convertUserToUserSource';
import updateProjectDatasets from './operation/updateProjectDatasets';
import {In} from 'typeorm';
import {ProjectSourceRepository} from './ProjectSourceRepository';


const canViewProjectMembersAndDatasets = (currentUserRole: UserProjectRole | null, isAdmin: boolean) =>
  isAdmin || ([UPRO.MANAGER, UPRO.MEMBER] as (UserProjectRole | null)[]).includes(currentUserRole);

const getProjectScopeRole = (currentUserRole: UserProjectRole | null, isAdmin: boolean): ScopeRole => {
  if (isAdmin) {
    return SRO.ADMIN;
  } else if (currentUserRole === UPRO.MANAGER) {
    return SRO.PROJECT_MANAGER;
  } else if (currentUserRole === UPRO.MEMBER) {
    return SRO.PROJECT_MEMBER;
  } else {
    return SRO.OTHER;
  }
};

const asyncAssertCanEditProject = async (ctx: Context, projectId: string) => {
  const userProject = await ctx.connection.getRepository(UserProjectModel).findOne({
    where: { projectId, userId: ctx.getUserIdOrFail(), role: UPRO.MANAGER }
  });
  if (!ctx.isAdmin && userProject == null) {
    throw new UserError('Unauthorized');
  }
};

const UserProject: FieldResolversFor<UserProject, UserProjectSource> = {
  async project(userProject, args, ctx: Context): Promise<ProjectSource> {
    const project = await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, userProject.projectId);

    if (project != null) {
      return project;
    } else {
      throw new UserError('Project not found');
    }
  },
  async numDatasets(userProject, args, {connection}: Context): Promise<number> {
    // NOTE: This number includes private datasets. It is only secure because we *currently* only resolve
    // `UserProjectSource`s when you are in the same project as the user, and thus allowed to see the private datasets
    // that are also in that project.
    // If this assumption changes, we'll have to consider whether showing a number that includes private datasets is a privacy breach.
    const {userId, projectId} = userProject;
    return await connection.getRepository(DatasetModel)
      .createQueryBuilder('dataset')
      .innerJoin('dataset.datasetProjects', 'datasetProject')
      .where('dataset.userId = :userId', {userId})
      .andWhere('datasetProject.projectId = :projectId', {projectId})
      .andWhere('datasetProject.approved = TRUE')
      .getCount();
  },
};

const Project: FieldResolversFor<Project, ProjectSource> = {
  async members(project, args, ctx: Context): Promise<UserProjectSource[]|null> {
    if (!canViewProjectMembersAndDatasets(project.currentUserRole, ctx.isAdmin)) {
      return null;
    }

    const userProjectModels = await ctx.connection
      .getRepository(UserProjectModel)
      .find({
        where: { projectId: project.id },
        relations: ['user', 'project'],
      });
    return userProjectModels.map(up => ({
      ...up,
      user: convertUserToUserSource(up.user, getProjectScopeRole(project.currentUserRole, ctx.isAdmin)),
    }));
  },

  async numMembers(project, args, ctx: Context): Promise<number> {
    return await ctx.connection
      .getRepository(UserProjectModel)
      .count({ where: { projectId: project.id, role: In([UPRO.MEMBER, UPRO.MANAGER]) } });
  },

  async numDatasets(project, args, ctx: Context): Promise<number> {
    if (canViewProjectMembersAndDatasets(project.currentUserRole, ctx.isAdmin)) {
      return await ctx.connection
        .getRepository(DatasetProjectModel)
        .count({ where: { projectId: project.id, approved: true } });
    } else {
      return await ctx.connection
        .getRepository(DatasetProjectModel)
        .createQueryBuilder('dataset_project')
        .innerJoinAndSelect('dataset_project.dataset', 'dataset')
        .innerJoin('(SELECT id, is_public FROM "public"."dataset")', 'engine_dataset', 'dataset.id = engine_dataset.id')
        .where('dataset_project.project_id = :projectId', {projectId: project.id})
        .andWhere('dataset_project.approved = TRUE')
        .andWhere('engine_dataset.is_public = TRUE')
        .getCount();
    }
  },

  async latestUploadDT(project, args, ctx: Context): Promise<Date> {
    let query = ctx.connection
      .getRepository(DatasetProjectModel)
      .createQueryBuilder('dataset_project')
      .innerJoin('dataset_project.dataset', 'dataset')
      .innerJoin('(SELECT id, is_public, upload_dt FROM "public"."dataset")', 'engine_dataset', 'dataset.id = engine_dataset.id')
      .select('MAX(engine_dataset.upload_dt)', 'upload_dt')
      .where('dataset_project.project_id = :projectId', {projectId: project.id})
      .andWhere('dataset_project.approved = TRUE');
    if (!canViewProjectMembersAndDatasets(project.currentUserRole, ctx.isAdmin)) {
      query = query.andWhere('engine_dataset.is_public = TRUE');
    }
    const {upload_dt} = await query.getRawOne();
    return upload_dt != null ? upload_dt.toISOString() : null;
  },

  async createdDT(project, args, ctx: Context): Promise<string> {
    // TODO: Use a custom GraphQL scalar type so that Moment and Date are automatically converted to ISO strings.
    // graphql-binding translates all custom scalar types to strings, unless you run it programmatically and change its config
    return project.createdDT.toISOString();
  },
};

const Query: FieldResolversFor<Query, void> = {
  async project(source, {projectId}, ctx): Promise<ProjectSource|null> {
    return await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId);
  },
  async projectByUrlSlug(source, {urlSlug}, ctx): Promise<ProjectSource|null> {
    return await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectByUrlSlug(ctx.user, urlSlug);
  },
  async allProjects(source, {query, offset, limit}, ctx): Promise<ProjectSource[]> {
    return await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectsByQuery(ctx.user, query, offset, limit);
  },
  async projectsCount(source, {query}, ctx): Promise<number> {
    return await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .countProjectsByQuery(ctx.user, query);
  }
};

const Mutation: FieldResolversFor<Mutation, void> = {
  async createProject(source, {projectDetails}, ctx): Promise<ProjectSource> {
    const userId = ctx.getUserIdOrFail(); // Exit early if not logged in
    const {name, isPublic, urlSlug} = projectDetails;
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
        role: UPRO.MANAGER
      });
    const project = await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, newProject.id);
    if (project != null) {
      return project;
    } else {
      throw Error(`Project became invisible to user after create ${newProject.id}`);
    }
  },

  async updateProject(source, {projectId, projectDetails}, ctx): Promise<ProjectSource> {
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

  async deleteProject(source, {projectId}, ctx): Promise<Boolean> {
    await asyncAssertCanEditProject(ctx, projectId);

    await ctx.connection.getRepository(DatasetProjectModel).delete({ projectId });
    await ctx.connection.getRepository(UserProjectModel).delete({ projectId });
    await ctx.connection.getRepository(ProjectModel).delete({ id: projectId });

    return true;
  },

  async leaveProject(source, {projectId}, ctx: Context): Promise<Boolean> {
    await updateUserProjectRole(ctx, ctx.getUserIdOrFail(), projectId, null);
    return true;
  },

  async removeUserFromProject(source, {projectId, userId}, ctx): Promise<Boolean> {
    await updateUserProjectRole(ctx, userId, projectId, null);

    return true;
  },

  async requestAccessToProject(source, {projectId}, ctx): Promise<UserProjectSource> {
    const userId = ctx.getUserIdOrFail();
    await updateUserProjectRole(ctx, userId, projectId, UPRO.PENDING);
    const userProject = await ctx.connection.getRepository(UserProjectModel)
      .findOneOrFail({userId, projectId}, {relations: ['user']});

    // NOTE: In the return value, some role-dependent fields like `userProject.project.currentUserRole` will still reflect
    // the user's role before the request was made. The UI currently doesn't rely on the result, but if it does,
    // it may be necessary to make a way to update the cached ctx.getUserProjectRoles() value
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) };
  },

  async acceptRequestToJoinProject(source, {projectId, userId}, ctx: Context): Promise<UserProjectSource> {
    await updateUserProjectRole(ctx, userId, projectId, UPRO.MEMBER);
    const userProject = await ctx.connection.getRepository(UserProjectModel)
      .findOneOrFail({userId, projectId}, {relations: ['user']});

    // NOTE: This return value has the same issue with role-dependent fields as `requestAccessToProject`
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) };
  },

  async inviteUserToProject(source, {projectId, email}, ctx: Context): Promise<UserProjectSource> {
    const user = await findUserByEmail(email);
    if (user == null) {
      throw new UserError('Not implemented yet');
    }
    const userId = user.id;

    await updateUserProjectRole(ctx, userId, projectId, UPRO.INVITED);

    const userProject = await ctx.connection.getRepository(UserProjectModel)
      .findOneOrFail({userId, projectId}, {relations: ['user']});
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) };
  },

  async acceptProjectInvitation(source, {projectId}, ctx): Promise<UserProjectSource> {
    const userId = ctx.getUserIdOrFail();
    await updateUserProjectRole(ctx, userId, projectId, UPRO.MEMBER);
    const userProject = await ctx.connection.getRepository(UserProjectModel)
      .findOneOrFail({userId, projectId}, {relations: ['user']});
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) };
  },

  async importDatasetsIntoProject(source, {projectId, datasetIds}, ctx): Promise<Boolean> {
    const userProjectRole = (await ctx.getCurrentUserProjectRoles())[projectId];
    if (userProjectRole == null) {
      throw new UserError('Not a member of project');
    }
    if (datasetIds.length > 0) {
      const approved = [UPRO.MEMBER, UPRO.MANAGER].includes(userProjectRole);
      await updateProjectDatasets(ctx, projectId, datasetIds, approved);
    }

    return true;
  }
};

export const Resolvers = {
  UserProject,
  Project,
  Query,
  Mutation,
} as IResolvers<any, Context>;
