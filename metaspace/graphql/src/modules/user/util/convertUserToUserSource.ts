import {User as UserModel} from '../model';
import {ScopeRole, UserSource} from '../../../bindingTypes';

// TODO: Find a better place to put convertUserToUserSource & other db->source functions
export const convertUserToUserSource = ({ id, name, role, email }: UserModel, scopeRole: ScopeRole): UserSource => ({
  id, name, role,
  email: email != null ? email : undefined,
  scopeRole,
});
