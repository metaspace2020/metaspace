import { Context } from '../../../context'
import { ApiUsage, Plan } from '../model'
import * as moment from 'moment'

const canPerformAction = async(ctx: Context, actionType: string) => {
  const user: any = ctx?.user

  if (user?.role === 'admin') {
    return true
  }

  if (!user.plan) {
    user.plan = await ctx.entityManager.createQueryBuilder(Plan,
      'plan')
      .leftJoinAndSelect('plan.planRules', 'planRules')
      .where('plan.id = :planId', { planId: user.planId })
      .getOne()
  }

  const planRules = user.plan.planRules.filter((rule: any) => rule.actionType === actionType)

  for (const rule of planRules as any[]) {
    const startDate = moment.utc().startOf(rule.periodType)
    const endDate = moment.utc().add(rule.period, rule.periodType)

    const usages = await ctx.entityManager
      .createQueryBuilder(ApiUsage, 'usage')
      .where('usage.actionType = :actionType', { actionType: actionType })
      .andWhere('usage.actionDt >= :startDate', { startDate: startDate.toDate() })
      .andWhere('usage.actionDt <= :endDate', { endDate: endDate.toDate() })
      .getMany()

    if (usages.length > rule.limit) {
      return false
    }
  }

  return true
}
export default canPerformAction
