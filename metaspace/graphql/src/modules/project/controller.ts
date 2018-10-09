import {IResolvers} from 'graphql-tools';
import {UserError} from 'graphql-errors';
import {Mutation, Project, Query, UserProject} from '../../binding';
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
import {projectIsVisibleToCurrentUserWhereClause} from './util/projectIsVisibleToCurrentUserWhereClause';
import updateUserProjectRole from './operation/updateUserProjectRole';
import convertProjectToProjectSource from './util/convertProjectToProjectSource';
import {convertUserToUserSource} from '../user/util/convertUserToUserSource';
import updateProjectDatasets from './operation/updateProjectDatasets';


const isLoggedIn = (ctx: Context) => ctx.user != null && ctx.user.id != null;
const canViewProjectMembersAndDatasets = (scopeRole: ScopeRole) =>
  [SRO.PROJECT_MANAGER, SRO.PROJECT_MEMBER, SRO.ADMIN].includes(scopeRole);
const assertIsLoggedIn = (ctx: Context) => {
  if (!isLoggedIn(ctx)) {
    throw new UserError('Unauthorized');
  }
};
const asyncAssertCanEditProject = async (ctx: Context, projectId: string) => {
  assertIsLoggedIn(ctx);
  const userProject = await ctx.connection.getRepository(UserProjectModel).findOne({
    where: { projectId, userId: ctx.user!.id, role: UPRO.MANAGER }
  });
  if (!ctx.isAdmin && userProject == null) {
    throw new UserError('Unauthorized');
  }
};

const UserProject: FieldResolversFor<UserProject, UserProjectSource> = {
  async project(userProject, args, ctx: Context): Promise<ProjectSource> {
    const userProjectRoles = await ctx.getCurrentUserProjectRoles();
    const project = await ctx.connection.getRepository(ProjectModel)
      .createQueryBuilder('project')
      .where(projectIsVisibleToCurrentUserWhereClause(ctx, userProjectRoles))
      .andWhere('project.id = :projectId', {projectId: userProject.projectId})
      .getOne();
    if (project == null) {
      throw new UserError('Project not found');
    }

    return convertProjectToProjectSource(project, ctx, userProjectRoles);
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
      .where('dataset.userId = :userId AND datasetProject.projectId = :projectId', {userId, projectId})
      .getCount();
  },
};

const Project: FieldResolversFor<Project, ProjectSource> = {
  async members({scopeRole, ...project}, args, ctx: Context): Promise<UserProjectSource[]|null> {
    if (!canViewProjectMembersAndDatasets(scopeRole)) {
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
      user: convertUserToUserSource(up.user, scopeRole),
    }));
  },

  async numMembers(project, args, ctx: Context): Promise<number> {
    return await ctx.connection
      .getRepository(UserProjectModel)
      .count({ where: { projectId: project.id } });
  },

  async numDatasets(project, args, ctx: Context): Promise<number> {
    if (canViewProjectMembersAndDatasets(project.scopeRole)) {
      return await ctx.connection
        .getRepository(DatasetProjectModel)
        .count({ where: { projectId: project.id } });
    } else {
      return await ctx.connection
        .getRepository(DatasetProjectModel)
        .createQueryBuilder('dataset_project')
        .innerJoinAndSelect('dataset_project.dataset', 'dataset')
        .innerJoin('(SELECT id, is_public FROM "public"."dataset")', 'public_dataset', 'dataset.id = public_dataset.id')
        .where('dataset_project.project_id = :projectId AND public_dataset.is_public = TRUE', {projectId: project.id})
        .getCount();
    }
  },

  async latestUploadDT(project, args, ctx: Context): Promise<Date> {
    let query = ctx.connection
      .getRepository(DatasetProjectModel)
      .createQueryBuilder('dataset_project')
      .innerJoin('dataset_project.dataset', 'dataset')
      .innerJoin('(SELECT id, is_public, upload_dt FROM "public"."dataset")', 'public_dataset', 'dataset.id = public_dataset.id')
      .select('MAX(public_dataset.upload_dt)', 'upload_dt');
    if (canViewProjectMembersAndDatasets(project.scopeRole)) {
      query = query.where('dataset_project.project_id = :projectId', {projectId: project.id})
    } else {
      query = query.where('dataset_project.project_id = :projectId AND public_dataset.is_public = TRUE', {projectId: project.id});
    }
    const {upload_dt} = await query.getRawOne();
    return upload_dt;
  }
};

const Query: FieldResolversFor<Query, void> = {
  async project(source, {projectId}, ctx): Promise<ProjectSource|null> {
    const userProjectRoles = await ctx.getCurrentUserProjectRoles();
    const project = await ctx.connection.getRepository(ProjectModel)
      .createQueryBuilder('project')
      .where(projectIsVisibleToCurrentUserWhereClause(ctx, userProjectRoles))
      .andWhere('project.id = :projectId', {projectId})
      .getOne();

    return project != null ? convertProjectToProjectSource(project, ctx, userProjectRoles) : null;
  },
  async projectByUrlSlug(source, {urlSlug}, ctx): Promise<ProjectSource|null> {
    const userProjectRoles = await ctx.getCurrentUserProjectRoles();
    const project = await ctx.connection.getRepository(ProjectModel)
      .createQueryBuilder('project')
      .where(projectIsVisibleToCurrentUserWhereClause(ctx, userProjectRoles))
      .andWhere('project.urlSlug = :urlSlug', {urlSlug})
      .getOne();

    return project != null ? convertProjectToProjectSource(project, ctx, userProjectRoles) : null;
  },
  async allProjects(source, {query, offset, limit}, ctx): Promise<ProjectSource[]> {
    const userProjectRoles = await ctx.getCurrentUserProjectRoles();
    let projectsQuery = await ctx.connection.getRepository(ProjectModel)
      .createQueryBuilder('project')
      .where(projectIsVisibleToCurrentUserWhereClause(ctx, userProjectRoles));

    if (query) {
      // TODO: Add a full-text index to project.name to speed this up
      // The below full-text query attempts to parse `query` as a phrase. If successful it appends ':*' so that the
      // last word in the query is used as a prefix search. If nothing in query is matchable then it just matches everything.
      projectsQuery = projectsQuery.andWhere(`(
        CASE WHEN phraseto_tsquery('english', :query)::text != '' 
             THEN to_tsvector('english', project.name) @@ to_tsquery(phraseto_tsquery('english', :query)::text || ':*') 
             ELSE true
        END
      )`, {query});
    }
    if (offset != null) {
      projectsQuery = projectsQuery.skip(offset);
    }
    if (limit != null) {
      projectsQuery = projectsQuery.take(limit);
    }

    // TODO: Order by whether the current user is a member & frecency
    const projects = await projectsQuery.getMany();
    return projects.map(project => convertProjectToProjectSource(project, ctx, userProjectRoles));
  },
  async projectsCount(source, {query}, ctx): Promise<number> {
    const userProjectRoles = await ctx.getCurrentUserProjectRoles();
    let projectsQuery = await ctx.connection.getRepository(ProjectModel)
      .createQueryBuilder('project')
      .where(projectIsVisibleToCurrentUserWhereClause(ctx, userProjectRoles));

    if (query) {
      projectsQuery = projectsQuery.andWhere(`(
        CASE WHEN phraseto_tsquery('english', :query)::text != '' 
             THEN to_tsvector('english', project.name) @@ to_tsquery(phraseto_tsquery('english', :query)::text || ':*') 
             ELSE true
        END
      )`, {query});
    }

    return await projectsQuery.getCount();
  }
};

const Mutation: FieldResolversFor<Mutation, void> = {
  async createProject(source, {projectDetails}, ctx): Promise<ProjectSource> {
    assertIsLoggedIn(ctx);
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
    const userProjectRoles = {
      ...(await ctx.getCurrentUserProjectRoles()),
      [newProject.id]: UPRO.MANAGER,
    };

    return convertProjectToProjectSource(newProject, ctx, userProjectRoles);
  },

  async updateProject(source, {projectId, projectDetails}, ctx): Promise<ProjectSource> {
    assertIsLoggedIn(ctx);
    await asyncAssertCanEditProject(ctx, projectId);
    if (projectDetails.urlSlug !== undefined && !ctx.isAdmin) {
      throw new UserError('urlSlug can only be set by METASPACE administrators');
    }

    const projectRepository = ctx.connection.getRepository(ProjectModel);
    await projectRepository.update(projectId, projectDetails);
    const project = await projectRepository.findOneOrFail({ where: {id: projectId}});
    const userProjectRoles = await ctx.getCurrentUserProjectRoles();

    return convertProjectToProjectSource(project, ctx, userProjectRoles);
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

    // TODO: Double-check userProjectRoles

    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) };
  },

  async acceptRequestToJoinProject(source, {projectId, userId}, ctx: Context): Promise<UserProjectSource> {
    await updateUserProjectRole(ctx, userId, projectId, UPRO.MEMBER);
    const userProject = await ctx.connection.getRepository(UserProjectModel)
      .findOneOrFail({userId, projectId}, {relations: ['user']});
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
    assertIsLoggedIn(ctx);

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
