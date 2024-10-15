import { FieldResolversFor } from '../../../bindingTypes'
import { Mutation } from '../../../binding'
import {
  Tier,
} from '../model'
import { UserError } from 'graphql-errors'
import { Repository } from 'typeorm'
import * as moment from 'moment/moment'
import { Project as ProjectModel } from '../../project/model'
import { ProjectSourceRepository } from '../../project/ProjectSourceRepository'

const MutationResolvers: FieldResolversFor<Mutation, void> = {
  async createTier(source, args, ctx): Promise<Tier> {
    if (!ctx.isAdmin) {
      throw new UserError('Unauthorized')
    }

    const { name, isActive } = args
    const tierRepo: Repository<Tier> = ctx.entityManager.getRepository(Tier)

    const newTier = tierRepo.create({
      name,
      isActive,
      createdAt: moment.utc(),
    })

    await tierRepo.insert(newTier)
    return await ctx.entityManager.findOneOrFail(
      Tier, { name: newTier.name }
    )
  },
  async updateTier(source, args, ctx): Promise<Tier> {
    if (!ctx.isAdmin) {
      throw new UserError('Unauthorized')
    }

    const { tierId, name, isActive } = args
    const tier = await ctx.entityManager.findOne(
      Tier, { id: tierId }
    )

    if (tier === null) {
      throw new UserError('Not found')
    }

    await ctx.entityManager.update(Tier, tierId, { name, isActive })

    return await ctx.entityManager.findOneOrFail(
      Tier, { id: tierId }
    )
  },
}
export default MutationResolvers
