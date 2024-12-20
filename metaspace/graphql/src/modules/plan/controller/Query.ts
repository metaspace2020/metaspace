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

interface AllPlanRulesArgs {
  planId?: number;
  filter?: {
    actionType?: string;
    type?: string;
    visibility?: string;
    source?: string;
    createdAt?: string;
  };
  orderBy?: 'ORDER_BY_DATE' | 'ORDER_BY_ACTION_TYPE' | 'ORDER_BY_TYPE' | 'ORDER_BY_VISIBILITY' | 'ORDER_BY_SOURCE';
  sortingOrder?: 'ASCENDING' | 'DESCENDING';
  offset?: number;
  limit?: number;
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
  async plansCount(_: any, { filter = {} }: { filter?: any }, ctx: Context): Promise<number> {
    const queryBuilder = ctx.entityManager.createQueryBuilder(Plan, 'plan')

    // Apply filters
    if (filter?.name) {
      queryBuilder.andWhere('LOWER(plan.name) LIKE LOWER(:name)', { name: `%${filter.name}%` })
    }

    if (filter?.isActive === undefined) {
      queryBuilder.andWhere('plan.is_active = :isActive', { isActive: true })
    } else {
      queryBuilder.andWhere('plan.is_active = :isActive', { isActive: filter.isActive })
    }

    if (filter?.isDefault !== undefined) {
      queryBuilder.andWhere('plan.is_default = :isDefault', { isDefault: filter.isDefault })
    }

    if (filter?.createdAt) {
      queryBuilder.andWhere('plan.created_at = :createdAt', { createdAt: filter.createdAt })
    }

    return await queryBuilder.getCount()
  },
  async planRule(_: any, { id }: { id: number }, ctx: Context): Promise<PlanRule | null> {
    const result = await ctx.entityManager.findOne(PlanRule, id)
    return result ?? null
  },
  async allPlanRules(_: any, args: AllPlanRulesArgs, ctx: Context): Promise<PlanRule[] | null> {
    const {
      planId,
      filter = {},
      orderBy = 'ORDER_BY_DATE',
      sortingOrder = 'DESCENDING',
      offset = 0,
      limit = 10,
    }: AllPlanRulesArgs = args

    const queryBuilder = ctx.entityManager.createQueryBuilder(PlanRule, 'planRule')
    const sortOrder = sortingOrder === 'ASCENDING' ? 'ASC' : 'DESC'

    if (planId) {
      queryBuilder.andWhere('planRule.plan_id = :planId', { planId })
    }

    if (filter?.actionType) {
      queryBuilder.andWhere('planRule.action_type = :actionType', { actionType: filter.actionType })
    }

    if (filter?.type) {
      queryBuilder.andWhere('planRule.type = :type', { type: filter.type })
    }

    if (filter?.visibility) {
      queryBuilder.andWhere('LOWER(planRule.visibility) LIKE LOWER(:visibility)',
        { visibility: `%${filter.visibility}%` })
    }

    if (filter?.source) {
      queryBuilder.andWhere('LOWER(planRule.source) LIKE LOWER(:source)',
        { source: `%${filter.source}%` })
    }

    if (filter?.createdAt) {
      queryBuilder.andWhere('planRule.created_at = :createdAt', { createdAt: filter.createdAt })
    }

    switch (orderBy) {
      case 'ORDER_BY_DATE':
        queryBuilder.orderBy('planRule.created_at', sortOrder)
        break
      case 'ORDER_BY_ACTION_TYPE':
        queryBuilder.orderBy('planRule.action_type', sortOrder)
        break
      case 'ORDER_BY_TYPE':
        queryBuilder.orderBy('planRule.type', sortOrder)
        break
      case 'ORDER_BY_VISIBILITY':
        queryBuilder.orderBy('planRule.visibility', sortOrder)
        break
      case 'ORDER_BY_SOURCE':
        queryBuilder.orderBy('planRule.source', sortOrder)
        break
      default:
        queryBuilder.orderBy('planRule.created_at', sortOrder)
    }

    queryBuilder.skip(offset).take(limit)

    return await queryBuilder.getMany()
  },
  async planRulesCount(_: any, args: AllPlanRulesArgs, ctx: Context): Promise<number> {
    const { planId, filter = {} }: AllPlanRulesArgs = args

    const queryBuilder = ctx.entityManager.createQueryBuilder(PlanRule, 'planRule')

    if (planId) {
      queryBuilder.andWhere('planRule.plan_id = :planId', { planId })
    }

    if (filter?.actionType) {
      queryBuilder.andWhere('planRule.action_type = :actionType', { actionType: filter.actionType })
    }

    if (filter?.type) {
      queryBuilder.andWhere('planRule.type = :type', { type: filter.type })
    }

    if (filter?.visibility) {
      queryBuilder.andWhere('LOWER(planRule.visibility) LIKE LOWER(:visibility)', {
        visibility: `%${filter.visibility}%`,
      })
    }

    if (filter?.source) {
      queryBuilder.andWhere('LOWER(planRule.source) LIKE LOWER(:source)', { source: `%${filter.source}%` })
    }

    if (filter?.createdAt) {
      queryBuilder.andWhere('planRule.created_at = :createdAt', { createdAt: filter.createdAt })
    }

    return await queryBuilder.getCount()
  },
  async allApiUsages(_: any, args, ctx: Context): Promise<ApiUsage[] | null> {
    return await ctx.entityManager.createQueryBuilder(ApiUsage, 'usage')
      .getMany()
  },
}
export default QueryResolvers
