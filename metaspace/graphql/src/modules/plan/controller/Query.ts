import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { Context } from '../../../context'
import { Plan, PlanRule, ApiUsage } from '../../plan/model'

const QueryResolvers: FieldResolversFor<Query, void> = {
  async allPlans(_: any, args, ctx: Context): Promise<Plan[] | null> {
    return await ctx.entityManager.createQueryBuilder(Plan, 'plan')
      .getMany()
  },
  async allPlanRules(_: any, { planId }, ctx: Context): Promise<PlanRule[] | null> {
    return await ctx.entityManager.createQueryBuilder(PlanRule, 'tr')
      .where((qb : any) => {
        if (planId) {
          qb.where('tr.plan_id = :planId', { planId })
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
