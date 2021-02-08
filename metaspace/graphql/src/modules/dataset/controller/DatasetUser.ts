import { DatasetUserSource, FieldResolversFor } from '../../../bindingTypes'
import { DatasetUser } from '../../../binding'
import canSeeUserEmail from '../../user/util/canSeeUserEmail'

const DatasetUser: FieldResolversFor<DatasetUser, DatasetUserSource> = {
  email(source, args, ctx) {
    return canSeeUserEmail(source.scopeRole) || ctx.isAdmin ? source.email : null
  },
}

export default DatasetUser
