import { Project, UserProjectRole } from '../../../binding'
import { UserProject as UserProjectModel, UserProjectRoleOptions as UPRO } from '../model'
import {
  FieldResolversFor,
  ProjectSource,
  ScopeRole,
  ScopeRoleOptions as SRO,
  UserProjectSource,
} from '../../../bindingTypes'
import { Context } from '../../../context'
import { convertUserToUserSource } from '../../user/util/convertUserToUserSource'
import { In } from 'typeorm'
import { DatasetProject as DatasetProjectModel } from '../../dataset/model'

const canViewProjectMembersAndDatasets = (currentUserRole: UserProjectRole | null, isAdmin: boolean) =>
  isAdmin || ([UPRO.MANAGER, UPRO.MEMBER] as (UserProjectRole | null)[]).includes(currentUserRole)

const getProjectScopeRole = (currentUserRole: UserProjectRole | null): ScopeRole => {
  if (currentUserRole === UPRO.MANAGER) {
    return SRO.PROJECT_MANAGER
  } else if (currentUserRole === UPRO.MEMBER) {
    return SRO.PROJECT_MEMBER
  } else {
    return SRO.OTHER
  }
}

const ProjectResolvers: FieldResolversFor<Project, ProjectSource> = {
  async hasPendingRequest(project, args, ctx: Context): Promise<boolean | null> {
    if (project.currentUserRole === UPRO.MANAGER) {
      const requests = await ctx.entityManager
        .getRepository(UserProjectModel)
        .count({
          where: { projectId: project.id, role: UPRO.PENDING },
        })
      return requests > 0
    }
    return null
  },

  async members(project, args, ctx: Context): Promise<UserProjectSource[] | null> {
    const filter = canViewProjectMembersAndDatasets(project.currentUserRole, ctx.isAdmin)
      ? { projectId: project.id }
      : { projectId: project.id, role: UPRO.MANAGER }

    const userProjectModels = await ctx.entityManager
      .getRepository(UserProjectModel)
      .createQueryBuilder('user_project')
      .where(filter)
      .leftJoinAndSelect('user_project.user', 'user')
      .leftJoinAndSelect('user_project.project', 'project')
      .orderBy(`CASE user_project.role 
                         WHEN '${UPRO.PENDING}' THEN 1 
                         WHEN '${UPRO.INVITED}' THEN 2 
                         WHEN '${UPRO.MANAGER}' THEN 3 
                         WHEN '${UPRO.MEMBER}' THEN 4 
                         ELSE 5 
                     END`)
      .addOrderBy('user.name')
      .getMany()
    return userProjectModels.map(up => ({
      ...up,
      user: convertUserToUserSource(up.user, getProjectScopeRole(project.currentUserRole)),
    }))
  },

  async numMembers(project, args, ctx: Context): Promise<number> {
    return await ctx.entityManager
      .getRepository(UserProjectModel)
      .count({ where: { projectId: project.id, role: In([UPRO.MEMBER, UPRO.MANAGER]) } })
  },

  async numDatasets(project, args, ctx: Context): Promise<number> {
    const canSeePrivateDatasets = canViewProjectMembersAndDatasets(project.currentUserRole, ctx.isAdmin)

    return await ctx.entityManager
      .getRepository(DatasetProjectModel)
      .createQueryBuilder('dataset_project')
      .innerJoinAndSelect('dataset_project.dataset', 'dataset')
      .innerJoin('(SELECT * FROM "public"."dataset")', 'engine_dataset', 'dataset.id = engine_dataset.id')
      .where('dataset_project.project_id = :projectId', { projectId: project.id })
      .andWhere('dataset_project.approved = TRUE')
      .andWhere(canSeePrivateDatasets ? 'TRUE' : 'engine_dataset.is_public')
      .andWhere('engine_dataset.status != \'FAILED\'')
      .getCount()
  },

  async latestUploadDT(project, args, ctx: Context): Promise<Date> {
    let query = ctx.entityManager
      .getRepository(DatasetProjectModel)
      .createQueryBuilder('dataset_project')
      .innerJoin('dataset_project.dataset', 'dataset')
      .innerJoin('(SELECT * FROM "public"."dataset")', 'engine_dataset', 'dataset.id = engine_dataset.id')
      .select('MAX(engine_dataset.upload_dt)', 'upload_dt')
      .where('dataset_project.project_id = :projectId', { projectId: project.id })
      .andWhere('dataset_project.approved = TRUE')
    if (!canViewProjectMembersAndDatasets(project.currentUserRole, ctx.isAdmin)) {
      query = query.andWhere('engine_dataset.is_public = TRUE')
    }
    const { upload_dt } = await query.getRawOne()
    return upload_dt != null ? upload_dt.toISOString() : null
  },

  createdDT(project): string {
    return project.createdDT.toISOString()
  },

  publishedDT(project): string | null {
    return project.publishedDT != null ? project.publishedDT.toISOString() : null
  },

  externalLinks(project) {
    return project.externalLinks || []
  },

  reviewToken(project, args, ctx) {
    if (project.currentUserRole === UPRO.MANAGER || ctx.isAdmin) {
      return project.reviewToken
    } else {
      return null
    }
  },
}

export default ProjectResolvers
