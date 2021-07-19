import { Brackets, EntityManager, EntityRepository } from 'typeorm'
import { UserError } from 'graphql-errors'
import * as DataLoader from 'dataloader'
import * as _ from 'lodash'

import { MolecularDB } from './model'
import { Context, ContextUser } from '../../context'

@EntityRepository()
export class MolecularDbRepository {
  constructor(private manager: EntityManager) {
  }

  private async queryWhere(user: ContextUser, andWhereClauses: Brackets[]) {
    let qb = this.manager.createQueryBuilder(MolecularDB, 'moldb')
      .leftJoinAndSelect('moldb.group', 'moldb_group')
      .orderBy('moldb.name')

    // Hide databases the user doesn't have access to
    if (user.id && user.role === 'admin') {
      qb = qb.where('true') // For consistency, in case `andWhere` is called without first calling `where`
    } else {
      const userGroupIds = await user.getMemberOfGroupIds()
      qb = qb.where(new Brackets(
        qb => qb.where('moldb.is_public = True').orWhere(
          'moldb.group_id = ANY(:userGroupIds)',
          { userGroupIds }
        )
      )
      )
    }

    // Add caller-supplied filters
    if (andWhereClauses.length > 0) {
      for (const clause of andWhereClauses) {
        qb = qb.andWhere(clause)
      }
    }

    // Avoid adding .where clauses to the returned queryBuilder, as it will overwrite the security filters
    return qb
  }

  private async queryWhereFiltered(user: ContextUser, usable?: boolean, groupId?: string|null) {
    const andWhereClauses: any = []
    if (usable === true) {
      const usableGroupIds = await user.getMemberOfGroupIds()
      const groupIdClause = new Brackets(
        qb => !qb.where('moldb.group_id is NULL').orWhere('moldb.group_id = ANY(:usableGroupIds)',
          { usableGroupIds })
      )
      const usableClause = new Brackets(qb => qb.where('moldb.archived = false').andWhere(groupIdClause))
      andWhereClauses.push(usableClause)
    }
    if (groupId !== undefined) {
      const groupIdClause: Brackets =
        (groupId === null)
          ? new Brackets(qb => qb.where('moldb.group_id IS NULL'))
          : new Brackets(qb => qb.where('moldb.group_id = :groupId', { groupId }))
      andWhereClauses.push(groupIdClause)
    }
    return this.queryWhere(user, andWhereClauses)
  }

  private getDataLoader(ctx: Context) {
    return ctx.contextCacheGet('MolecularDbRepository.getDataLoader', [], () => {
      return new DataLoader(async(databaseIds: number[]): Promise<any[]> => {
        const databaseIdsClause = new Brackets(
          qb => qb.where('moldb.id = ANY(:databaseIds)', { databaseIds })
        )
        const query = await this.queryWhere(ctx.user, [databaseIdsClause])
        const results = await query.getMany()
        const keyedResults = _.keyBy(results, 'id')
        return databaseIds.map(id => keyedResults[id])
      })
    })
  }

  async findDatabaseById(ctx: Context, databaseId: number): Promise<MolecularDB> {
    const dataLoader = this.getDataLoader(ctx)
    const database = await dataLoader.load(databaseId)
    if (database == null) {
      throw new UserError('Unauthorized or database does not exist')
    }
    return database
  }

  async findDatabasesByIds(ctx: Context, databaseIds: number[]): Promise<MolecularDB[]> {
    const dataLoader = this.getDataLoader(ctx)
    const databases = await dataLoader.loadMany(databaseIds)
    return databases.filter(db => db != null)
  }

  async findDatabases(user: ContextUser, usable?: boolean, groupId?: string|null): Promise<MolecularDB[]> {
    return (await this.queryWhereFiltered(user, usable, groupId)).getMany()
  }

  async countDatabases(user: ContextUser, usable?: boolean, groupId?: string|null): Promise<number> {
    return (await this.queryWhereFiltered(user, usable, groupId)).getCount()
  }
}
