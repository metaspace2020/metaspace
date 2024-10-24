import { Context } from '../../../context'
import { Plan } from '../model'

const canPerformAction = async(ctx: Context, action: string) => {
  const user: any = ctx?.user

  if (user?.role === 'admin') {
    console.log(action)
    return true
  }

  if (!user.plan) {
    user.plan = await ctx.entityManager.createQueryBuilder(Plan,
      'plan')
      .leftJoinAndSelect('plan.planRules', 'planRules')
      .where('plan.id = :planId', { planId: user.planId })
      .getOne()
  }

  return false
}
export default canPerformAction
