import {FieldResolversFor, ProjectSource} from '../../../bindingTypes';
import {Query} from '../../../binding';
import {ProjectSourceRepository} from '../ProjectSourceRepository';

const QueryResolvers: FieldResolversFor<Query, void> = {
  async project(source, { projectId }, ctx): Promise<ProjectSource | null> {
    return await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, projectId);
  },
  async projectByUrlSlug(source, { urlSlug }, ctx): Promise<ProjectSource | null> {
    return await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectByUrlSlug(ctx.user, urlSlug);
  },
  async allProjects(source, { query, offset, limit }, ctx): Promise<ProjectSource[]> {
    return await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectsByQuery(ctx.user, query, offset, limit);
  },
  async projectsCount(source, { query }, ctx): Promise<number> {
    return await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .countProjectsByQuery(ctx.user, query);
  },
};

export default QueryResolvers;
