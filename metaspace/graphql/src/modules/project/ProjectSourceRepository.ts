import {Brackets, EntityManager, EntityRepository} from 'typeorm';
import {ContextUser} from '../../context';
import {Project as ProjectModel, UserProjectRoleOptions as UPRO} from './model';
import {ProjectSource} from '../../bindingTypes';

type SortBy = 'name' | 'popularity';

@EntityRepository()
export class ProjectSourceRepository {
  constructor(private manager: EntityManager) {
  }

  private queryProjectsWhere(user: ContextUser | null, whereClause?: string, parameters?: object, sortBy: SortBy = 'name') {
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
    if (user && user.role === 'admin') {
      qb = qb.where('true'); // For consistency, in case anything weird happens when `andWhere` is called without first calling `where`
    } else if (user != null) {
      qb = qb.where(new Brackets(qb => qb.where('project.is_public = True')
        .orWhere('project.id IN (SELECT project_id FROM graphql.user_project WHERE user_id = :userId AND role = ANY(:roles))',
          { userId: user.id, roles: [UPRO.INVITED, UPRO.PENDING, UPRO.MEMBER, UPRO.MANAGER] })));
    } else {
      qb = qb.where('project.is_public = True');
    }
    // Add caller-supplied filter
    if (whereClause) {
      qb = qb.andWhere(whereClause, parameters);
    }

    // Add currentUserRole field
    if (user != null) {
      qb = qb.leftJoin('project.members', 'user_project',
        'project.id = user_project.project_id AND user_project.user_id = :userId', { userId: user.id })
        .addSelect('user_project.role', 'currentUserRole')
    } else {
      qb = qb.addSelect('null::text', 'currentUserRole');
    }

    // Avoid adding .where clauses to the returned queryBuilder, as it will overwrite the security filters
    return qb;
  }

  async findProjectById(user: ContextUser | null, projectId: string): Promise<ProjectSource | null> {
    return await this.queryProjectsWhere(user, 'project.id = :projectId', {projectId})
      .getRawOne() || null;
  }

  async findProjectByUrlSlug(user: ContextUser | null, urlSlug: string): Promise<ProjectSource | null> {
    return await this.queryProjectsWhere(user, 'project.urlSlug = :urlSlug', {urlSlug})
      .getRawOne() || null;
  }

  async findProjectsByDatasetId(user: ContextUser | null, datasetId: string): Promise<ProjectSource[]> {
    return await this.queryProjectsWhere(user, `EXISTS (
        SELECT 1 FROM graphql.dataset_project 
        WHERE dataset_project.project_id = project.id 
        AND (:isAdmin OR dataset_project.approved OR project.id = ANY(:projectIds))
        AND dataset_project.dataset_id = :datasetId
      )`, {
      datasetId,
      projectIds: user != null ? await user.getMemberOfProjectIds() : [],
      isAdmin: user != null && user.role === 'admin',
    })
      .getRawMany();
  }

  private queryProjectsByTextSearch(user: ContextUser | null, query?: string, sortBy: SortBy = 'name') {
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

  async findProjectsByQuery(user: ContextUser | null, query?: string,
                            offset?: number, limit?: number): Promise<ProjectSource[]> {
    let queryBuilder = this.queryProjectsByTextSearch(user, query, 'popularity');
    if (offset != null) {
      queryBuilder = queryBuilder.offset(offset);
    }
    if (limit != null) {
      queryBuilder = queryBuilder.limit(limit);
    }
    return await queryBuilder.getRawMany();
  }

  async countProjectsByQuery(user: ContextUser | null, query?: string): Promise<number> {
    return await this.queryProjectsByTextSearch(user, query).getCount();
  }
}
