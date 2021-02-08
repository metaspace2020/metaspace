import { User as UserModel } from '../model'
import { ScopeRole, UserSource } from '../../../bindingTypes'

// TODO: Find a better place to put convertUserToUserSource & other db->source functions
export const convertUserToUserSource = (user: UserModel, scopeRole: ScopeRole): UserSource => ({ ...user, scopeRole })
