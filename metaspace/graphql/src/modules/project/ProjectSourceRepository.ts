import {Brackets, EntityManager, EntityRepository} from 'typeorm';
import {ContextUser} from '../../context';
import {Project as ProjectModel, UserProjectRoleOptions as UPRO} from './model';
import {ProjectSource} from '../../bindingTypes';


@EntityRepository()
export class ProjectSourceRepository {
  constructor(private manager: EntityManager) {
  }

  private queryProjectsWhere(user: ContextUser | null, whereClause?: string, parameters?: object) {
    const columnMap = this.manager.connection
      .getMetadata(ProjectModel)
      .columns
      .map(c => `"project"."${c.databasePath}" AS "${c.propertyName}"`);

    let qb = this.manager
      .createQueryBuilder(ProjectModel, 'project')
      .select(columnMap);

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
      .getRawOne();
  }

  async findProjectByUrlSlug(user: ContextUser | null, urlSlug: string): Promise<ProjectSource | null> {
    return await this.queryProjectsWhere(user, 'project.urlSlug = :urlSlug', {urlSlug})
      .getRawOne();
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

  async findProjectsByQuery(user: ContextUser | null, query?: string,
                            offset?: number, limit?: number): Promise<ProjectSource[]> {
    let queryBuilder;
    if (query) {
      // TODO: Add a full-text index to project.name to speed this up
      // The below full-text query attempts to parse `query` as a phrase. If successful it appends ':*' so that the
      // last word in the query is used as a prefix search. If nothing in query is matchable then it just matches everything.
      queryBuilder = this.queryProjectsWhere(user, `(
        CASE WHEN phraseto_tsquery('english', :query)::text != '' 
             THEN to_tsvector('english', project.name) @@ to_tsquery(phraseto_tsquery('english', :query)::text || ':*') 
             ELSE true
        END
      )`, {query});
    } else {
      queryBuilder = this.queryProjectsWhere(user);
    }
    if (offset != null) {
      queryBuilder = queryBuilder.skip(offset);
    }
    if (limit != null) {
      queryBuilder = queryBuilder.take(limit);
    }
    return await queryBuilder.getRawMany();
  }

  async countProjectsByQuery(user: ContextUser | null, query?: string): Promise<number> {
    if (query) {
      return await this.queryProjectsWhere(user, `(
        CASE WHEN phraseto_tsquery('english', :query)::text != '' 
             THEN to_tsvector('english', project.name) @@ to_tsquery(phraseto_tsquery('english', :query)::text || ':*') 
             ELSE true
        END
      )`, { query })
        .getCount();
    } else {
      return await this.queryProjectsWhere(user)
        .getCount();
    }
  }
}
