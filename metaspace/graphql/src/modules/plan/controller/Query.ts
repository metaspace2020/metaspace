import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { Context } from '../../../context'
import { Plan, PlanRule, ApiUsage } from '../../plan/model'

interface AllPlansArgs {
  filter?: {
    name?: string
    isActive?: boolean
    isDefault?: boolean
    createdAt?: string
  };
  orderBy?: 'ORDER_BY_DATE' | 'ORDER_BY_NAME' | 'ORDER_BY_ACTIVE' | 'ORDER_BY_DEFAULT';
  sortingOrder?: 'ASCENDING' | 'DESCENDING';
  offset?: number
  limit?: number
}

const QueryResolvers: FieldResolversFor<Query, void> = {
  async plan(_: any, { id }: { id: number }, ctx: Context): Promise<Plan | null> {
    const result = await ctx.entityManager.findOne(Plan, id)
    return result ?? null
  },
  async allPlans(_: any, args: AllPlansArgs, ctx: Context): Promise<Plan[] | null> {
    const {
      filter = {}, orderBy = 'ORDER_BY_DATE', sortingOrder = 'DESCENDING', offset = 0,
      limit = 10,
    } : AllPlansArgs = args

    const queryBuilder = ctx.entityManager.createQueryBuilder(Plan, 'plan')
    const sortOrder = sortingOrder === 'ASCENDING' ? 'ASC' : 'DESC'

    // dont return isActive false by default
    if (filter?.isActive === undefined) {
      queryBuilder.andWhere('plan.is_active = :isActive', { isActive: true })
    } else {
      queryBuilder.andWhere('plan.is_active = :isActive', { isActive: filter.isActive })
    }

    if (filter?.name) {
      queryBuilder.andWhere('LOWER(plan.name) LIKE LOWER(:name)', { name: `%${filter.name}%` })
    }

    if (filter?.isDefault !== undefined) {
      queryBuilder.andWhere('plan.is_default = :isDefault', { isDefault: filter.isDefault })
    }
    if (filter?.createdAt) {
      queryBuilder.andWhere('plan.created_at = :createdAt', { createdAt: filter.createdAt })
    }

    switch (orderBy) {
      case 'ORDER_BY_DATE':
        queryBuilder.orderBy('plan.created_at', sortOrder)
        break
      case 'ORDER_BY_NAME':
        queryBuilder.orderBy('plan.name', sortOrder)
        break
      case 'ORDER_BY_ACTIVE':
        queryBuilder.orderBy('plan.is_active', sortOrder)
        break
      case 'ORDER_BY_DEFAULT':
        queryBuilder.orderBy('plan.is_default', sortOrder)
        break
      default:
        queryBuilder.orderBy('plan.created_at', sortOrder)
    }

    queryBuilder.skip(offset).take(limit)

    return await queryBuilder.getMany()
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
