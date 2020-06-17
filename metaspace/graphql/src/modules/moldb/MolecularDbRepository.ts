import {Brackets, EntityManager, EntityRepository, In} from 'typeorm';
import {Context, ContextUser} from '../../context';
import {UserError} from 'graphql-errors';
import * as DataLoader from 'dataloader';
import * as _ from 'lodash';

import {MolecularDB} from './model';


@EntityRepository()
export class MolecularDbRepository {
  constructor(private manager: EntityManager) {
  }

  private queryWhere(user: ContextUser, whereClause?: string | Brackets, parameters?: object) {
    const columnMap = this.manager.connection
      .getMetadata(MolecularDB)
      .columns
      .map(c => `"moldb"."${c.databasePath}" AS "${c.propertyName}"`);

    let qb = this.manager.createQueryBuilder(MolecularDB, 'moldb').select(columnMap).orderBy('moldb.name');

    // Hide databases the user doesn't have access to
    if (user.id && user.role === 'admin') {
      qb = qb.where('true'); // For consistency, in case `andWhere` is called without first calling `where`
    } else {
      qb = qb.where(new Brackets(
        qb => qb.where('moldb.public = True')
          .orWhere('moldb.group_id = ANY(:userGroupIds)',{ userGroupIds: user.groupIds })
        )
      );
    }

    // Add caller-supplied filter
    if (whereClause) {
      qb = qb.andWhere(whereClause, parameters);
    }

    // Avoid adding .where clauses to the returned queryBuilder, as it will overwrite the security filters
    return qb;
  }

  private createDataLoader(ctx: Context, functionName: string) {
    return ctx.contextCacheGet(functionName, [], () => {
      return new DataLoader(async (databaseIds: number[]): Promise<any[]> => {
        const query = this.queryWhere(ctx.user, 'moldb.id = ANY(:databaseIds)', { databaseIds });
        const results = await query.getRawMany();
        const keyedResults = _.keyBy(results, 'id');
        return databaseIds.map(id => keyedResults[id]);
      });
    });
  }

  async findDatabases(user: ContextUser): Promise<MolecularDB[]> {
    const query = this.queryWhere(user);
    return await query.getRawMany();
  }

  async findDatabaseById(ctx: Context, databaseId: number): Promise<MolecularDB> {
    const dataLoader = this.createDataLoader(ctx, 'findDatabaseByIdDataLoader');
    const database =  await dataLoader.load(databaseId);
    if (database == null) {
      throw new UserError(`Unauthorized or database does not exist`);
    }
    return database;
  }

  async findDatabasesByIds(ctx: Context, databaseIds: number[]): Promise<MolecularDB[]> {
    const dataLoader = this.createDataLoader(ctx, 'findDatabasesByIdsDataLoader');
    return await dataLoader.loadMany(databaseIds);
  }
}
