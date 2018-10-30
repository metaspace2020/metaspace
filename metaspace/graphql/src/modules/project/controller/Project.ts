import {Project, UserProjectRole} from '../../../binding';
import {UserProject as UserProjectModel, UserProjectRoleOptions as UPRO} from '../model';
import {
  FieldResolversFor,
  ProjectSource,
  ScopeRole,
  ScopeRoleOptions as SRO,
  UserProjectSource,
} from '../../../bindingTypes';
import {Context} from '../../../context';
import {convertUserToUserSource} from '../../user/util/convertUserToUserSource';
import {In} from 'typeorm';
import {DatasetProject as DatasetProjectModel} from '../../dataset/model';

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

const ProjectResolvers: FieldResolversFor<Project, ProjectSource> = {
  async members(project, args, ctx: Context): Promise<UserProjectSource[] | null> {
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
        .where('dataset_project.project_id = :projectId', { projectId: project.id })
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
      .where('dataset_project.project_id = :projectId', { projectId: project.id })
      .andWhere('dataset_project.approved = TRUE');
    if (!canViewProjectMembersAndDatasets(project.currentUserRole, ctx.isAdmin)) {
      query = query.andWhere('engine_dataset.is_public = TRUE');
    }
    const { upload_dt } = await query.getRawOne();
    return upload_dt != null ? upload_dt.toISOString() : null;
  },

  async createdDT(project, args, ctx: Context): Promise<string> {
    // TODO: Use a custom GraphQL scalar type so that Moment and Date are automatically converted to ISO strings.
    // graphql-binding translates all custom scalar types to strings, unless you run it programmatically and change its config
    return project.createdDT.toISOString();
  },
};

export default ProjectResolvers;
