import { FieldResolversFor } from '../../../bindingTypes'
import { Mutation } from '../../../binding'
import { activateBetaTesterToken } from '../util/betaTesterApi'

const MutationResolvers: FieldResolversFor<Mutation, void> = {
  async activateBetaTester(_, { token, features, startDate, endDate }) {
    return activateBetaTesterToken(token, {
      features: features || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })
  },
}

export default MutationResolvers
