import { FieldResolversFor } from '../../../bindingTypes'
import { PlanRule, Plan } from '../model'
import { Context } from '../../../context'

const PlanRuleResolvers: FieldResolversFor<PlanRule, PlanRule> = {
  async plan(planRule: PlanRule, args: Record<string, never>, ctx: Context): Promise<Plan | null> {
    const result = await ctx.entityManager.findOne(Plan, planRule.planId)
    return result ?? null
  },
}

export default PlanRuleResolvers
