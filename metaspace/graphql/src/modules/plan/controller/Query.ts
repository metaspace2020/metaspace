import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { Context } from '../../../context'
import { Plan, PlanRule, ApiUsage } from '../../plan/model'
import { UserError } from 'graphql-errors'

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
  orderBy?: 'ORDER_BY_DATE' | 'ORDER_BY_ACTION_TYPE' | 'ORDER_BY_TYPE' | 'ORDER_BY_VISIBILITY' |
   'ORDER_BY_SOURCE' | 'ORDER_BY_PLAN';
  sortingOrder?: 'ASCENDING' | 'DESCENDING';
  offset?: number;
  limit?: number;
}

interface AllApiUsagesArgs {
  filter?: {
    userId?: string;
    datasetId?: string;
    projectId?: string;
    groupId?: string;
    actionType?: string;
    type?: string;
    source?: string;
    canEdit?: boolean;
    startDate?: string;
    endDate?: string;
  };
  orderBy?: 'ORDER_BY_DATE' | 'ORDER_BY_USER' | 'ORDER_BY_ACTION_TYPE' | 'ORDER_BY_TYPE' | 'ORDER_BY_SOURCE';
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
      case 'ORDER_BY_PLAN':
        queryBuilder.orderBy('plan.name', sortOrder)
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
  async allApiUsages(_: any, args: AllApiUsagesArgs, ctx: Context): Promise<ApiUsage[] | null> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    const {
      filter = {},
      orderBy = 'ORDER_BY_DATE',
      sortingOrder = 'DESCENDING',
      offset = 0,
      limit = 10,
    }: AllApiUsagesArgs = args

    const queryBuilder = ctx.entityManager.createQueryBuilder(ApiUsage, 'usage')
    const sortOrder = sortingOrder === 'ASCENDING' ? 'ASC' : 'DESC'

    // Apply filters
    if (filter?.userId) {
      queryBuilder.andWhere('usage.user_id = :userId', { userId: filter.userId })
    }

    if (filter?.datasetId) {
      queryBuilder.andWhere('usage.dataset_id = :datasetId', { datasetId: filter.datasetId })
    }

    if (filter?.projectId) {
      queryBuilder.andWhere('usage.project_id = :projectId', { projectId: filter.projectId })
    }

    if (filter?.groupId) {
      queryBuilder.andWhere('usage.group_id = :groupId', { groupId: filter.groupId })
    }

    if (filter?.actionType) {
      queryBuilder.andWhere('usage.action_type = :actionType', { actionType: filter.actionType })
    }

    if (filter?.type) {
      queryBuilder.andWhere('usage.type = :type', { type: filter.type })
    }

    if (filter?.source) {
      queryBuilder.andWhere('LOWER(usage.source) LIKE LOWER(:source)', { source: `%${filter.source}%` })
    }

    if (filter?.canEdit !== undefined) {
      queryBuilder.andWhere('usage.can_edit = :canEdit', { canEdit: filter.canEdit })
    }

    if (filter?.startDate) {
      queryBuilder.andWhere('usage.action_dt >= :startDate', { startDate: filter.startDate })
    }

    if (filter?.endDate) {
      queryBuilder.andWhere('usage.action_dt <= :endDate', { endDate: filter.endDate })
    }

    // Apply sorting
    switch (orderBy) {
      case 'ORDER_BY_DATE':
        queryBuilder.orderBy('usage.action_dt', sortOrder)
        break
      case 'ORDER_BY_USER':
        queryBuilder.orderBy('usage.user_id', sortOrder)
        break
      case 'ORDER_BY_ACTION_TYPE':
        queryBuilder.orderBy('usage.action_type', sortOrder)
        break
      case 'ORDER_BY_TYPE':
        queryBuilder.orderBy('usage.type', sortOrder)
        break
      case 'ORDER_BY_SOURCE':
        queryBuilder.orderBy('usage.source', sortOrder)
        break
      default:
        queryBuilder.orderBy('usage.action_dt', sortOrder)
    }

    // Apply pagination
    queryBuilder.skip(offset).take(limit)

    return await queryBuilder.getMany()
  },
  async apiUsagesCount(_: any, args: AllApiUsagesArgs, ctx: Context): Promise<number> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied')
    }

    const {
      filter = {},
    }: AllApiUsagesArgs = args
    const queryBuilder = ctx.entityManager.createQueryBuilder(ApiUsage, 'usage')

    if (filter?.userId) {
      queryBuilder.andWhere('usage.user_id = :userId', { userId: filter.userId })
    }

    if (filter?.datasetId) {
      queryBuilder.andWhere('usage.dataset_id = :datasetId', { datasetId: filter.datasetId })
    }

    if (filter?.projectId) {
      queryBuilder.andWhere('usage.project_id = :projectId', { projectId: filter.projectId })
    }

    if (filter?.groupId) {
      queryBuilder.andWhere('usage.group_id = :groupId', { groupId: filter.groupId })
    }

    if (filter?.actionType) {
      queryBuilder.andWhere('usage.action_type = :actionType', { actionType: filter.actionType })
    }

    if (filter?.type) {
      queryBuilder.andWhere('usage.type = :type', { type: filter.type })
    }

    if (filter?.source) {
      queryBuilder.andWhere('LOWER(usage.source) LIKE LOWER(:source)', { source: `%${filter.source}%` })
    }

    if (filter?.canEdit !== undefined) {
      queryBuilder.andWhere('usage.can_edit = :canEdit', { canEdit: filter.canEdit })
    }

    if (filter?.startDate) {
      queryBuilder.andWhere('usage.action_dt >= :startDate', { startDate: filter.startDate })
    }

    if (filter?.endDate) {
      queryBuilder.andWhere('usage.action_dt <= :endDate', { endDate: filter.endDate })
    }

    return await queryBuilder.getCount()
  },
}
export default QueryResolvers
