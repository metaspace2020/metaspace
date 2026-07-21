import { UserError } from 'graphql-errors'
import { FieldResolversFor, ProjectSource } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { Context } from '../../../context'
import { ProjectSourceRepository } from '../ProjectSourceRepository'
import { validateUrlSlugChange } from '../../groupOrProject/urlSlug'
import { Project as ProjectModel } from '../model'

// A non-admin may only filter projects by their own user id. Returns the ids to filter by, or
// undefined when no filtering was requested.
const resolveUserIdsFilter = (userIds: string[] | null | undefined, ctx: Context): string[] | undefined => {
  if (userIds == null || userIds.length === 0) {
    return undefined
  }
  const isOwnOnly = ctx.user.id != null && userIds.every(id => id === ctx.user.id)
  if (!ctx.isAdmin && !isOwnOnly) {
    throw new UserError('Not authorized to filter projects by other users')
  }
  return userIds
}

const QueryResolvers: FieldResolversFor<Query, void> = {
  async project(source, { projectId }, ctx): Promise<ProjectSource | null> {
    return await ctx.entityManager
      .getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId)
  },
  async projectByUrlSlug(
    source,
    { urlSlug },
    ctx
  ): Promise<ProjectSource | null> {
    return await ctx.entityManager
      .getCustomRepository(ProjectSourceRepository)
      .findProjectByUrlSlug(ctx.user, urlSlug)
  },
  async allProjects(
    source,
    { orderBy, sortingOrder, query, offset, limit, userIds },
    ctx
  ): Promise<ProjectSource[]> {
    return await ctx.entityManager
      .getCustomRepository(ProjectSourceRepository)
      .findProjectsByQuery(
        ctx.user,
        query,
        offset,
        limit,
        orderBy,
        sortingOrder,
        resolveUserIdsFilter(userIds, ctx)
      )
  },
  async projectsCount(
    source,
    { orderBy, sortingOrder, query, userIds },
    ctx
  ): Promise<number> {
    return await ctx.entityManager
      .getCustomRepository(ProjectSourceRepository)
      .countProjectsByQuery(
        ctx.user,
        query,
        orderBy,
        sortingOrder,
        resolveUserIdsFilter(userIds, ctx)
      )
  },
  async projectUrlSlugIsValid(
    source,
    { urlSlug, existingProjectId },
    ctx
  ): Promise<boolean> {
    await validateUrlSlugChange(
      ctx.entityManager,
      ProjectModel,
      existingProjectId || null,
      urlSlug
    )
    return true
  },
}

export default QueryResolvers
