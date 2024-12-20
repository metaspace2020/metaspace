import { FieldResolversFor } from '../../../bindingTypes'
import { Plan, PlanRule } from '../model'
import { Context } from '../../../context'

const PlanResolvers: FieldResolversFor<Plan, Plan> = {
  async planRules(plan: Plan, args: Record<string, never>, ctx: Context): Promise<PlanRule[] | null> {
    const result = await ctx.entityManager.find(PlanRule, {
      where: { planId: plan.id },
    })
    return result ?? null
  },
}

export default PlanResolvers
