import {Brackets, EntityManager, EntityRepository} from 'typeorm';
import {Context, ContextUser} from '../../context';
import {Project as ProjectModel, UserProjectRoleOptions, UserProjectRoleOptions as UPRO} from './model';
import {ProjectSource} from '../../bindingTypes';
import * as _ from 'lodash';
import * as DataLoader from 'dataloader';

type SortBy = 'name' | 'popularity';

@EntityRepository()
export class ProjectSourceRepository {
  constructor(private manager: EntityManager) {
  }

  private async queryProjectsWhere(user: ContextUser, whereClause?: string, parameters?: object, sortBy: SortBy = 'name') {
    const columnMap = this.manager.connection
      .getMetadata(ProjectModel)
      .columns
      .map(c => `"project"."${c.databasePath}" AS "${c.propertyName}"`);

    let qb = this.manager
      .createQueryBuilder(ProjectModel, 'project')
      .select(columnMap);

    if (sortBy === 'name') {
      qb = qb.orderBy('project.name');
    } else {
      // Approximate popularity as num_members * 20 + num_datasets
      qb = qb
        .leftJoin(`(SELECT project_id, COUNT(*) as cnt 
                            FROM graphql.user_project 
                            WHERE role IN ('${UPRO.MEMBER}','${UPRO.MANAGER}') 
                            GROUP BY project_id)`,
          'num_members', 'project.id = num_members.project_id')
        .leftJoin(`(SELECT project_id, COUNT(*) as cnt 
                            FROM graphql.dataset_project 
                            WHERE approved = true
                            GROUP BY project_id)`,
          'num_datasets', 'project.id = num_datasets.project_id')
        .orderBy('(COALESCE(num_members.cnt * 20, 0) + COALESCE(num_datasets.cnt, 0))', 'DESC')
        .addOrderBy('project.name');
    }

    // Hide datasets the current user doesn't have access to
    if (user.id && user.role === 'admin') {
      qb = qb.where('true'); // For consistency, in case anything weird happens when `andWhere` is called without first calling `where`
    } else {
      const allProjectIds = Object.entries(await user.getProjectRoles())
        .filter(([id, role]) => role != UPRO.PENDING).map(([id, role]) => id);
      qb = qb.where(new Brackets(qb => qb.where('project.is_public = True')
        .orWhere('project.id = ANY(:projectIds)', { projectIds: allProjectIds })));
    }
    // Add caller-supplied filter
    if (whereClause) {
      qb = qb.andWhere(whereClause, parameters);
    }

    // Add currentUserRole field
    if (user.id != null) {
      qb = qb.leftJoin('project.members', 'user_project',
        'project.id = user_project.project_id AND user_project.user_id = :userId', {userId: user.id})
        .addSelect('user_project.role', 'currentUserRole');
    } else {
      qb = qb.addSelect('null::text', 'currentUserRole');
    }

    // Avoid adding .where clauses to the returned queryBuilder, as it will overwrite the security filters
    return qb;
  }

  async findProjectById(user: ContextUser, projectId: string): Promise<ProjectSource | null> {
    return await (await this.queryProjectsWhere(user, 'project.id = :projectId', {projectId}))
      .getRawOne() || null;
  }

  async findProjectByUrlSlug(user: ContextUser, urlSlug: string): Promise<ProjectSource | null> {
    return await (await this.queryProjectsWhere(user, 'project.urlSlug = :urlSlug', {urlSlug}))
      .getRawOne() || null;
  }

  async findProjectsByDatasetId(ctx: Context, datasetId: string): Promise<ProjectSource[]> {
    const dataLoader = ctx.contextCacheGet('findProjectsByDatasetIdDataLoader', [], () => {
      return new DataLoader(async (datasetIds: string[]) => {
        return await this.findProjectsByDatasetIds(ctx.user, datasetIds);
      })
    });
    return dataLoader.load(datasetId);
  }

  async findProjectsByDatasetIds(user: ContextUser, datasetIds: string[]): Promise<ProjectSource[][]> {
    const rows = await (await this.queryProjectsWhere(user, `
        (:isAdmin OR dataset_project.approved OR project.id = ANY(:projectIds))
        AND dataset_project.dataset_id = ANY(:datasetIds)`,
      {
        datasetIds,
        projectIds: await user.getMemberOfProjectIds(),
        isAdmin: user.id != null && user.role === 'admin',
      }))
      .innerJoin('dataset_project', 'dataset_project', 'dataset_project.project_id = project.id')
      .addSelect('dataset_project.dataset_id', 'datasetId')
      .getRawMany();
    const groupedRows = _.groupBy(rows, 'datasetId') as Record<string, ProjectSource[]>;
    return datasetIds.map(id => groupedRows[id] || []);
  }

  private queryProjectsByTextSearch(user: ContextUser, query?: string, sortBy: SortBy = 'name') {
    if (query) {
      // Full-text search is disabled as it relies on functions not present in the installed pg version (9.5)
      // TODO: Add a full-text index to project.name to speed this up
      // The below full-text query attempts to parse `query` as a phrase. If successful it appends ':*' so that the
      // last word in the query is used as a prefix search. If nothing in query is matchable then it just matches everything.
      // queryBuilder = this.queryProjectsWhere(user, `(
      //   CASE WHEN phraseto_tsquery('english', :query)::text != ''
      //        THEN to_tsvector('english', project.name) @@ to_tsquery(phraseto_tsquery('english', :query)::text || ':*')
      //        ELSE true
      //   END
      // )`, {query});
      return this.queryProjectsWhere(user, `project.name ILIKE ('%' || :query || '%')`, {query}, sortBy);
    } else {
      return this.queryProjectsWhere(user, undefined, undefined, sortBy);
    }
  }

  async findProjectsByQuery(user: ContextUser, query?: string,
                            offset?: number, limit?: number): Promise<ProjectSource[]> {
    let queryBuilder = await this.queryProjectsByTextSearch(user, query, 'popularity');
    if (offset != null) {
      queryBuilder = queryBuilder.offset(offset);
    }
    if (limit != null) {
      queryBuilder = queryBuilder.limit(limit);
    }
    return await queryBuilder.getRawMany();
  }

  async countProjectsByQuery(user: ContextUser, query?: string): Promise<number> {
    return await (await this.queryProjectsByTextSearch(user, query)).getCount();
  }
}
