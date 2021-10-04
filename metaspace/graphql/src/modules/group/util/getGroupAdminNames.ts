import { Context } from '../../../context'
import * as DataLoader from 'dataloader'
import { UserGroup as UserGroupModel, UserGroupRoleOptions } from '../model'
import * as _ from 'lodash'

const getGroupAdminNames = async(ctx: Context, groupId: string) => {
  const dataloader = ctx.contextCacheGet('getGroupAdminNamesDataLoader', [], () => {
    return new DataLoader(async(groupIds: string[]): Promise<string[][]> => {
      const results = await ctx.entityManager.createQueryBuilder(UserGroupModel, 'userGroup')
        .leftJoin('userGroup.user', 'user')
        .where('userGroup.groupId = ANY(:groupIds)', { groupIds })
        .andWhere('userGroup.role = :role', { role: UserGroupRoleOptions.GROUP_ADMIN })
        .groupBy('userGroup.groupId')
        .select('userGroup.groupId', 'groupId')
        .addSelect('array_agg(user.name)', 'names')
        .getRawMany()
      const keyedResults = _.keyBy(results, 'groupId')
      return groupIds.map(id => keyedResults[id] != null ? keyedResults[id].names : [])
    })
  })
  return dataloader.load(groupId)
}

export default getGroupAdminNames
