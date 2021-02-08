import { ScopeRole, ScopeRoleOptions as SRO } from '../../../bindingTypes'

const canSeeUserEmail = (scopeRole: ScopeRole) => {
  return [SRO.GROUP_MANAGER, SRO.PROJECT_MANAGER, SRO.PROFILE_OWNER].includes(scopeRole)
}

export default canSeeUserEmail
