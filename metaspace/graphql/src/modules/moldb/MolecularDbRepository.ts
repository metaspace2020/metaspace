import {Brackets, EntityManager, EntityRepository, SelectQueryBuilder} from 'typeorm';
import {UserError} from 'graphql-errors';
import * as DataLoader from 'dataloader';
import * as _ from 'lodash';

import {MolecularDB} from './model';
import {Context, ContextUser} from '../../context';


@EntityRepository()
export class MolecularDbRepository {
  constructor(private manager: EntityManager) {
  }

  private queryWhere(user: ContextUser, andWhereClause?: string | Brackets, parameters?: object) {
    let qb = this.manager.createQueryBuilder(MolecularDB, 'moldb')
      .leftJoinAndSelect('moldb.group', 'moldb_group')
      .orderBy('moldb.name');

    // Hide databases the user doesn't have access to
    if (user.id && user.role === 'admin') {
      qb = qb.where('true'); // For consistency, in case `andWhere` is called without first calling `where`
    } else {
      qb = qb.where(new Brackets(
        qb => qb.where('moldb.is_public = True').orWhere(
            'moldb.group_id = ANY(:userGroupIds)',
            { userGroupIds: user.groupIds ?? [] }
          )
        )
      );
    }

    // Add caller-supplied filter
    if (andWhereClause != null) {
      qb = qb.andWhere(andWhereClause, parameters);
    }

    // Avoid adding .where clauses to the returned queryBuilder, as it will overwrite the security filters
    return qb;
  }

  private queryWhereGroup(user: ContextUser, groupId?: string): SelectQueryBuilder<MolecularDB> {
    return (groupId != null)
      ? this.queryWhere(user, 'moldb.group_id = :groupId', { groupId })
      : this.queryWhere(user)
  }

  private getDataLoader(ctx: Context) {
    return ctx.contextCacheGet('MolecularDbRepository.getDataLoader', [], () => {
      return new DataLoader(async (databaseIds: number[]): Promise<any[]> => {
        const query = this.queryWhere(ctx.user, 'moldb.id = ANY(:databaseIds)', { databaseIds });
        const results = await query.getMany();
        const keyedResults = _.keyBy(results, 'id');
        return databaseIds.map(id => keyedResults[id]);
      });
    });
  }

  async findVisibleDatabases(user: ContextUser, groupId?: string): Promise<MolecularDB[]> {
    return await this.queryWhereGroup(user, groupId).getMany();
  }

  async countVisibleDatabases(user: ContextUser, groupId?: string): Promise<number> {
    return await this.queryWhereGroup(user, groupId).getCount();
  }

  async findUsableDatabases(user: ContextUser): Promise<MolecularDB[]> {
    const groupWhereStmt = new Brackets(qb => qb.where('moldb.group_id is NULL')
      .orWhere('moldb.group_id = ANY(:usableGroupIds)', { usableGroupIds: user.groupIds ?? [] }));
    const query = this.queryWhere(user,
      new Brackets(qb => qb.where('moldb.archived = false').andWhere(groupWhereStmt))
    );
    return await query.getMany();
  }

  async findDatabaseById(ctx: Context, databaseId: number): Promise<MolecularDB> {
    const dataLoader = this.getDataLoader(ctx);
    const database =  await dataLoader.load(databaseId);
    if (database == null) {
      throw new UserError(`Unauthorized or database does not exist`);
    }
    return database;
  }

  async findDatabasesByIds(ctx: Context, databaseIds: number[]): Promise<MolecularDB[]> {
    const dataLoader = this.getDataLoader(ctx);
    const databases = await dataLoader.loadMany(databaseIds);
    return databases.filter(db => db != null);
  }
}
