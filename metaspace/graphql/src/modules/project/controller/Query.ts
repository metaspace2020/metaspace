import { FieldResolversFor, ProjectSource } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { ProjectSourceRepository } from '../ProjectSourceRepository'
import { validateUrlSlugChange } from '../../groupOrProject/urlSlug'
import { Project as ProjectModel } from '../model'

const QueryResolvers: FieldResolversFor<Query, void> = {
  async project(source, { projectId }, ctx): Promise<ProjectSource | null> {
    return await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId)
  },
  async projectByUrlSlug(source, { urlSlug }, ctx): Promise<ProjectSource | null> {
    return await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectByUrlSlug(ctx.user, urlSlug)
  },
  async allProjects(source, {
    orderBy, sortingOrder,
    query, offset, limit,
  }, ctx): Promise<ProjectSource[]> {
    return await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .findProjectsByQuery(ctx.user, query, offset, limit, orderBy, sortingOrder)
  },
  async projectsCount(source, { query }, ctx): Promise<number> {
    return await ctx.entityManager.getCustomRepository(ProjectSourceRepository)
      .countProjectsByQuery(ctx.user, query)
  },
  async projectUrlSlugIsValid(source, { urlSlug, existingProjectId }, ctx): Promise<boolean> {
    await validateUrlSlugChange(ctx.entityManager, ProjectModel, existingProjectId || null, urlSlug)
    return true
  },
}

export default QueryResolvers
