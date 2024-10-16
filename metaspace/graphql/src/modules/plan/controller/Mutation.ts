import { FieldResolversFor } from '../../../bindingTypes'
import { Mutation } from '../../../binding'
import {
  Plan,
} from '../model'
import { UserError } from 'graphql-errors'
import { Repository } from 'typeorm'
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
    })

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
      throw new UserError('Not found')
    }

    await ctx.entityManager.update(Plan, planId, { name, isActive })

    return await ctx.entityManager.findOneOrFail(
      Plan, { id: planId }
    )
  },
}
export default MutationResolvers
