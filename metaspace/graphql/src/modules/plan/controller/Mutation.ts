import { FieldResolversFor } from '../../../bindingTypes'
import { Mutation } from '../../../binding'
import {
  ApiUsage,
  Plan, PlanRule,
} from '../model'
import { UserError } from 'graphql-errors'
import { DeepPartial, Repository } from 'typeorm'
import * as moment from 'moment/moment'

const MutationResolvers: FieldResolversFor<Mutation, void> = {
  async createPlan(source, args, ctx): Promise<Plan> {
    if (!ctx.isAdmin) {
      throw new UserError('Unauthorized')
    }

    const { name, isActive } = args
    const planRepo: Repository<Plan> = ctx.entityManager.getRepository(Plan)

    const newPlan = planRepo.create({
      name,
      isActive,
      createdAt: moment.utc(),
    } as DeepPartial<Plan>)

    await planRepo.insert(newPlan)
    return await ctx.entityManager.findOneOrFail(
      Plan, { name: newPlan.name }
    )
  },
  async updatePlan(source, args, ctx): Promise<Plan> {
    if (!ctx.isAdmin) {
      throw new UserError('Unauthorized')
    }

    const { planId, name, isActive } = args
    const plan = await ctx.entityManager.findOne(
      Plan, { id: planId }
    )

    if (plan === null) {
      throw new Error('Not found')
    }

    await ctx.entityManager.update(Plan, planId, { name, isActive })

    return await ctx.entityManager.findOneOrFail(
      Plan, { id: planId }
    )
  },
  async createPlanRule(source, args, ctx): Promise<PlanRule> {
    if (!ctx.isAdmin) {
      throw new UserError('Unauthorized')
    }

    const {
      planId, actionType, period,
      periodType, limit, type, visibility, requestSource,
    } = args
    const planRuleRepo: Repository<PlanRule> = ctx.entityManager.getRepository(PlanRule)

    const newPlanRule = planRuleRepo.create({
      planId,
      actionType,
      period,
      periodType,
      limit,
      type,
      visibility,
      source: requestSource,
      createdAt: moment.utc(),
    } as DeepPartial<PlanRule>)

    await planRuleRepo.insert(newPlanRule)
    return await ctx.entityManager.findOneOrFail(
      PlanRule, { id: newPlanRule.id }
    )
  },
  async updatePlanRule(source, args, ctx): Promise<PlanRule> {
    if (!ctx.isAdmin) {
      throw new UserError('Unauthorized')
    }

    const {
      planRuleId, actionType, period,
      periodType, limit, type, visibility, requestSource,
    } = args

    const planRule = await ctx.entityManager.findOne(
      PlanRule, { id: planRuleId }
    )

    if (planRule === null) {
      throw new Error('Not found')
    }

    await ctx.entityManager.update(PlanRule, planRuleId, {
      actionType,
      period,
      periodType,
      limit,
      type,
      visibility,
      source: requestSource,
    } as DeepPartial<PlanRule>)

    return await ctx.entityManager.findOneOrFail(
      PlanRule, { id: planRuleId }
    )
  },
  async deletePlanRule(source, args, ctx): Promise<boolean> {
    if (!ctx.isAdmin) {
      throw new UserError('Unauthorized')
    }

    const { planRuleId } = args

    try {
      await ctx.entityManager.delete(
        PlanRule, { id: planRuleId }
      )
    } catch (e) {
      return false
    }

    return true
  },
  async createApiUsage(source, args, ctx): Promise<ApiUsage> {
    const {
      userId, datasetId, actionType, type,
      requestSource, projectId, groupId, visibility,
      canEdit,
    } = args
    const apiUsageRepo: Repository<ApiUsage> = ctx.entityManager.getRepository(ApiUsage)
    const newApiUsage = apiUsageRepo.create({
      userId,
      datasetId,
      actionType,
      type,
      projectId,
      groupId,
      visibility,
      canEdit,
      source: requestSource,
      actionDt: moment.utc(),
    } as DeepPartial<ApiUsage>)

    await apiUsageRepo.insert(newApiUsage)
    return await ctx.entityManager.findOneOrFail(
      ApiUsage, { id: newApiUsage.id }
    )
  },
}
export default MutationResolvers
