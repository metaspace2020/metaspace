import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { Context } from '../../../context'
import { Tier, TierRule, ApiUsage } from '../../tier/model'

const QueryResolvers: FieldResolversFor<Query, void> = {
  async allTiers(_: any, args, ctx: Context): Promise<Tier[] | null> {
    return await ctx.entityManager.createQueryBuilder(Tier, 'tier')
      .getMany()
  },
  async allTierRules(_: any, { tierId }, ctx: Context): Promise<TierRule[] | null> {
    return await ctx.entityManager.createQueryBuilder(TierRule, 'tr')
      .where((qb : any) => {
        if (tierId) {
          qb.where('tr.tier_id = :tierId', { tierId })
        }
      })
      .getMany()
  },
  async allApiUsages(_: any, args, ctx: Context): Promise<ApiUsage[] | null> {
    return await ctx.entityManager.createQueryBuilder(ApiUsage, 'usage')
      .getMany()
  },
}
export default QueryResolvers
