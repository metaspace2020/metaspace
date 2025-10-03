import { Context } from '../../../context'
import {
  Project as ProjectModel,
  UserProject as UserProjectModel,
  UserProjectRoleOptions as UPRO,
} from '../model'
import { PublicationStatusOptions as PSO, validatePublishingRules } from '../Publishing'
import { UserError } from 'graphql-errors'
import { FieldResolversFor, ProjectSource, ScopeRoleOptions as SRO, UserProjectSource } from '../../../bindingTypes'
import { Mutation } from '../../../binding'
import { ProjectSourceRepository } from '../ProjectSourceRepository'
import { DatasetProject as DatasetProjectModel } from '../../dataset/model'
import updateUserProjectRole from '../operation/updateUserProjectRole'
import { convertUserToUserSource } from '../../user/util/convertUserToUserSource'
import { createInactiveUser } from '../../auth/operation'
import updateProjectDatasets from '../operation/updateProjectDatasets'
import { User as UserModel } from '../../user/model'
import config from '../../../utils/config'
import { sendInvitationEmail } from '../../auth'
import { findUserByEmail } from '../../../utils'
import {
  sendAcceptanceEmail,
  sendRequestAccessEmail,
  sentGroupOrProjectInvitationEmail,
} from '../../groupOrProject/email'
import { smApiUpdateDataset } from '../../../utils/smApi/datasets'
import { utc } from 'moment'
import generateRandomToken from '../../../utils/generateRandomToken'
import { addExternalLink, removeExternalLink, ExternalLinkProviderOptions as ELPO } from '../ExternalLink'
import { validateUrlSlugChange } from '../../groupOrProject/urlSlug'
import { validateTiptapJson } from '../../../utils/tiptap'
import { getDatasetForEditing } from '../../dataset/operation/getDatasetForEditing'
import { EngineDataset } from '../../engine/model'
import logger from '../../../utils/logger'
import { assertCanPerformAction, performAction } from '../../plan/util/canPerformAction'
import * as moment from 'moment'

const asyncAssertCanEditProject = async(ctx: Context, projectId: string) => {
  const userProject = await ctx.entityManager.findOne(UserProjectModel, {
    where: { projectId, userId: ctx.getUserIdOrFail(), role: UPRO.MANAGER },
  })
  if (!ctx.isAdmin && userProject == null) {
    throw new UserError('Unauthorized')
  }
}

const MutationResolvers: FieldResolversFor<Mutation, void> = {
  async createProject(source, { projectDetails }, ctx): Promise<ProjectSource> {
    const userId = ctx.getUserIdOrFail() // Exit early if not logged in
    const { name, isPublic, urlSlug } = projectDetails
    const action: any = {
      actionType: 'create',
      userId: ctx.user.id,
      type: 'project',
      visibility: isPublic ? 'public' : 'private',
      actionDt: moment.utc(moment.utc().toDate()),
      source: (ctx as any).getSource(),
    }

    await assertCanPerformAction(ctx, action)

    if (urlSlug != null) {
      await validateUrlSlugChange(ctx.entityManager, ProjectModel as any, null, urlSlug)
    }

    const projectRepository = ctx.entityManager.getRepository(ProjectModel)
    const newProject = projectRepository.create({ name, isPublic, urlSlug, createdDT: moment.utc() })
    await projectRepository.insert(newProject as any)
    await ctx.entityManager.insert(UserProjectModel, {
      projectId: newProject.id,
      userId,
      role: UPRO.MANAGER,
    } as any)
    // @ts-ignore
    const project = await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, newProject.id)

    action.projectId = newProject.id
    action.canEdit = true

    await performAction(ctx, action)

    if (project != null) {
      return project
    } else {
      throw Error(`Project became invisible to user after create ${newProject.id}`)
    }
  },

  async updateProject(source, { projectId, projectDetails }, ctx): Promise<ProjectSource> {
    await asyncAssertCanEditProject(ctx, projectId)

    // @ts-ignore
    const project = await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId)

    if (project == null) {
      throw new UserError(`Not found project ${projectId}`)
    }

    const action: any = {
      actionType: 'update',
      userId: ctx.user.id,
      projectId: project.id,
      type: 'project',
      canEdit: true,
      visibility: project.isPublic ? 'public' : 'private',
      actionDt: moment.utc(moment.utc().toDate()),
      source: (ctx as any).getSource(),
    }
    await assertCanPerformAction(ctx, action)

    validatePublishingRules(ctx, project, projectDetails)

    if (projectDetails.urlSlug != null) {
      await validateUrlSlugChange(ctx.entityManager, ProjectModel as any, projectId, projectDetails.urlSlug)
    }
    if (projectDetails.projectDescription != null) {
      validateTiptapJson(projectDetails.projectDescription, 'projectDescription')
    }

    await ctx.entityManager.update(ProjectModel, projectId, projectDetails)

    if (projectDetails.name || projectDetails.isPublic) {
      const affectedDatasets = await ctx.entityManager.find(DatasetProjectModel as any,
        { where: { projectId }, relations: ['dataset', 'dataset.datasetProjects'] })
      await Promise.all(affectedDatasets.map(async dp => {
        await smApiUpdateDataset((dp as any).datasetId, {
          projectIds: (dp as any).dataset.datasetProjects.map((p: any) => p.projectId),
        }, { asyncEsUpdate: true })
      }))
    }

    // @ts-ignore
    const updatedProject = await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId)

    await performAction(ctx, action)

    if (updatedProject != null) {
      return updatedProject
    } else {
      throw new UserError(`Project became invisible to user after update ${projectId}`)
    }
  },

  async deleteProject(source, { projectId }, ctx: Context): Promise<boolean> {
    await asyncAssertCanEditProject(ctx, projectId)

    const projectRepository = ctx.entityManager.getRepository(ProjectModel)
    const project = await projectRepository.findOne({ id: projectId })

    if (project) {
      if (project.publicationStatus === PSO.UNPUBLISHED || ctx.isAdmin) {
        const affectedDatasets = await ctx.entityManager.find(DatasetProjectModel as any,
          { where: { projectId }, relations: ['dataset', 'dataset.datasetProjects'] })
        await ctx.entityManager.delete(DatasetProjectModel, { projectId })
        await Promise.all(affectedDatasets.map(async dp => {
          await smApiUpdateDataset((dp as any).datasetId, {
            projectIds: (dp as any).dataset.datasetProjects
              .filter((p: any) => p.projectId !== projectId)
              .map((p: any) => p.projectId),
          }, { asyncEsUpdate: true })
        }))

        await ctx.entityManager.delete(UserProjectModel, { projectId })
        await projectRepository.delete({ id: projectId })
      } else {
        throw new UserError(JSON.stringify({
          type: 'under_review_or_published',
          message: `Cannot modify project ${projectId} in ${project.publicationStatus} status`,
        }))
      }
    }
    return true
  },

  async leaveProject(source, { projectId }, ctx: Context): Promise<boolean> {
    await updateUserProjectRole(ctx, ctx.getUserIdOrFail(), projectId, null)
    return true
  },

  async removeUserFromProject(source, { projectId, userId }, ctx: Context): Promise<boolean> {
    await updateUserProjectRole(ctx, userId, projectId, null)

    return true
  },

  async requestAccessToProject(source, { projectId }, ctx: Context): Promise<UserProjectSource> {
    const userId = ctx.getUserIdOrFail()
    await updateUserProjectRole(ctx, userId, projectId, UPRO.PENDING)
    const userProject = await ctx.entityManager.findOneOrFail(UserProjectModel,
      { userId, projectId }, { relations: ['user', 'project'] })

    const managers = await ctx.entityManager.find(UserProjectModel,
      { where: { projectId, role: UPRO.MANAGER }, relations: ['user'] })
    managers.forEach(manager => {
      sendRequestAccessEmail('project', manager.user, userProject.user, userProject.project)
    })

    // NOTE: In the return value, some role-dependent fields like `userProject.project.currentUserRole` will still reflect
    // the user's role before the request was made. The UI currently doesn't rely on the result, but if it does,
    // it may be necessary to make a way to update the cached ctx.getUserProjectRoles() value
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) }
  },

  async acceptRequestToJoinProject(source, { projectId, userId }, ctx: Context): Promise<UserProjectSource> {
    await updateUserProjectRole(ctx, userId, projectId, UPRO.MEMBER)
    const userProject = await ctx.entityManager.findOneOrFail(UserProjectModel,
      { userId, projectId }, { relations: ['user', 'project'] })

    sendAcceptanceEmail('project', userProject.user, userProject.project)

    // NOTE: This return value has the same issue with role-dependent fields as `requestAccessToProject`
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) }
  },

  async inviteUserToProject(source, { projectId, email } : { projectId: string; email: string },
    ctx: Context): Promise<UserProjectSource> {
    email = email.trim() // Trim spaces at the ends, because copy+pasting email addresses often adds unwanted spaces
    let user = await findUserByEmail(ctx.entityManager, email)
      || await findUserByEmail(ctx.entityManager, email, 'not_verified_email')
    const currentUser = await ctx.entityManager.findOneOrFail(UserModel, ctx.getUserIdOrFail())
    if (user == null) {
      user = await createInactiveUser(email)
      const link = `${config.web_public_url}/account/create-account`
      sendInvitationEmail(email, currentUser.name || '', link)
    } else {
      const project = await ctx.entityManager.findOneOrFail(ProjectModel, projectId)
      sentGroupOrProjectInvitationEmail('project', user, currentUser, project)
    }
    const userId = user.id

    await updateUserProjectRole(ctx, userId, projectId, UPRO.INVITED)

    const userProject = await ctx.entityManager.findOneOrFail(UserProjectModel,
      { userId, projectId }, { relations: ['user'] })
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) }
  },

  async acceptProjectInvitation(source, { projectId }, ctx: Context): Promise<UserProjectSource> {
    const userId = ctx.getUserIdOrFail()
    await updateUserProjectRole(ctx, userId, projectId, UPRO.MEMBER)
    const userProject = await ctx.entityManager.findOneOrFail(UserProjectModel,
      { userId, projectId }, { relations: ['user'] })
    return { ...userProject, user: convertUserToUserSource(userProject.user, SRO.OTHER) }
  },

  async updateUserProject(source, { projectId, userId, update }, ctx: Context): Promise<boolean> {
    await asyncAssertCanEditProject(ctx, projectId)
    await updateUserProjectRole(ctx, userId, projectId, update.role || null)
    return true
  },

  async importDatasetsIntoProject(source, {
    projectId, datasetIds,
    removedDatasetIds,
  }, ctx: Context): Promise<boolean> {
    const userProjectRole = (await ctx.user.getProjectRoles())[projectId]
    if (userProjectRole == null && !ctx.isAdmin) {
      throw new UserError('Not a member of project')
    }

    if (
      (datasetIds != null && datasetIds.length > 0)
        || (removedDatasetIds != null && removedDatasetIds.length > 0)
    ) {
      // Verify user is allowed to add/remove the datasets from the project
      await Promise.all((datasetIds || []).concat(removedDatasetIds || []).map(async(dsId: string) => {
        const dataset = await ctx.entityManager.getRepository(EngineDataset).findOne({
          id: dsId,
        })
        if (dataset?.isPublic === false) { // if ds is private, user can only add/remove if it is from the project
          const project = await ctx.entityManager.getRepository(DatasetProjectModel).findOne({
            datasetId: dsId,
            projectId: projectId,
          })
          if (!project) { // if ds not in the project, check if user can edit it
            await getDatasetForEditing(ctx.entityManager, ctx.user, dsId)
          }
        }
      }))

      if (datasetIds && datasetIds.length > 0) {
        logger.info(`Datasets ${datasetIds} added to ${projectId}`)
      }
      if (removedDatasetIds && removedDatasetIds.length > 0) {
        logger.info(`Datasets ${removedDatasetIds} removed from ${projectId}`)
      }

      const approved = ([UPRO.MEMBER, UPRO.MANAGER].includes(userProjectRole) || ctx.isAdmin)
      await updateProjectDatasets(ctx, projectId, (datasetIds || []), (removedDatasetIds || []),
        approved, false)
    }

    return true
  },

  async createReviewLink(source, { projectId }, ctx: Context): Promise<ProjectSource> {
    await asyncAssertCanEditProject(ctx, projectId)

    const project = await ctx.entityManager.findOneOrFail(ProjectModel, projectId)
    await ctx.entityManager.update(ProjectModel, projectId, {
      reviewToken: generateRandomToken(),
      reviewTokenCreatedDT: utc(),
      publicationStatus: project.publicationStatus === PSO.PUBLISHED ? PSO.PUBLISHED : PSO.UNDER_REVIEW,
    } as any)

    // @ts-ignore
    return await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId) as ProjectSource
  },

  async deleteReviewLink(source, { projectId }, ctx: Context): Promise<boolean> {
    await asyncAssertCanEditProject(ctx, projectId)

    const project = await ctx.entityManager.findOneOrFail(ProjectModel, projectId)
    await ctx.entityManager.update(ProjectModel, projectId, {
      reviewToken: null,
      reviewTokenCreatedDT: null,
      publicationStatus: project.publicationStatus === PSO.PUBLISHED ? PSO.PUBLISHED : PSO.UNPUBLISHED,
    } as any)
    return true
  },

  async publishProject(source, { projectId }, ctx: Context): Promise<ProjectSource> {
    await asyncAssertCanEditProject(ctx, projectId)

    await ctx.entityManager.update(ProjectModel, projectId, {
      publicationStatus: PSO.PUBLISHED,
      publishedDT: utc(),
      isPublic: true,
    } as any)

    const affectedDatasets = await ctx.entityManager.find(DatasetProjectModel as any, { where: { projectId } })
    await Promise.all(affectedDatasets.map(async dp => {
      await smApiUpdateDataset((dp as any).datasetId, { isPublic: true }, { asyncEsUpdate: true })
    }))

    // @ts-ignore
    return await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId) as ProjectSource
  },

  async unpublishProject(source, { projectId, isPublic }, ctx: Context): Promise<ProjectSource> {
    if (!ctx.isAdmin) {
      throw new UserError('Unauthorized')
    }

    const project = await ctx.entityManager.findOneOrFail(ProjectModel, projectId)
    await ctx.entityManager.update(ProjectModel as any, projectId, {
      publicationStatus: project.reviewToken ? PSO.UNDER_REVIEW : PSO.UNPUBLISHED,
      isPublic,
    } as any)

    if (isPublic != null) {
      const affectedDatasets = await ctx.entityManager.find(DatasetProjectModel as any,
        { where: { projectId } })
      await Promise.all(affectedDatasets.map(async dp => {
        await smApiUpdateDataset((dp as any).datasetId, { isPublic }, { asyncEsUpdate: true })
      }))
    }

    // @ts-ignore
    return await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId) as ProjectSource
  },

  addProjectExternalLink: async(
    source,
    { projectId, provider, link, replaceExisting },
    ctx: Context
  ) => {
    await asyncAssertCanEditProject(ctx, projectId)
    await ctx.entityManager.transaction(async txn => {
      const project = await ctx.entityManager.findOneOrFail(ProjectModel, projectId)

      if (provider === ELPO.DOI && project.publicationStatus !== PSO.PUBLISHED) {
        throw new UserError('Cannot add DOI, project is not published')
      }

      await txn.update(ProjectModel, projectId, {
        externalLinks: addExternalLink(project.externalLinks, provider, link, replaceExisting),
      })
    })

    // @ts-ignore
    return (await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId))!
  },

  removeProjectExternalLink: async(
    source,
    { projectId, provider, link },
    ctx: Context
  ) => {
    await asyncAssertCanEditProject(ctx, projectId)
    await ctx.entityManager.transaction(async txn => {
      const project = await ctx.entityManager.findOneOrFail(ProjectModel, projectId)
      await txn.update(ProjectModel, projectId, {
        externalLinks: removeExternalLink(project.externalLinks, provider, link),
      })
    })

    // @ts-ignore
    return (await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId))!
  },
}

export default MutationResolvers
