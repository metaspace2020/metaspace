import { GraphQLFieldResolver } from 'graphql'
import { Context } from './context'
import { User as UserModel } from './modules/user/model'
import { UserGroup as UserGroupModel } from './modules/group/model'
import { Project as ProjectModel, UserProject as UserProjectModel } from './modules/project/model'
import { UserProjectRole } from './binding'
import { ESDataset } from '../esConnector'

export type ScopeRole =
  'PROFILE_OWNER'
  | 'GROUP_MEMBER'
  | 'GROUP_MANAGER'
  | 'PROJECT_MEMBER'
  | 'PROJECT_MANAGER'
  | 'OTHER';

export const ScopeRoleOptions: Record<ScopeRole, ScopeRole> = {
  PROFILE_OWNER: 'PROFILE_OWNER',
  GROUP_MEMBER: 'GROUP_MEMBER',
  GROUP_MANAGER: 'GROUP_MANAGER',
  PROJECT_MEMBER: 'PROJECT_MEMBER',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  OTHER: 'OTHER',
}

export interface Scope {
  scopeRole: ScopeRole
}

// Source types
export type UserSource = UserModel & Scope;
export type ProjectSource = ProjectModel & { currentUserRole: UserProjectRole | null };
export type UserProjectSource = {
  [field in keyof UserProjectModel]: field extends 'user' ? UserSource : UserProjectModel[field]
};
export type UserGroupSource = {
  [field in keyof UserGroupModel]: field extends 'user' ? UserSource : UserGroupModel[field]
}
export type DatasetSource = ESDataset;
export interface DatasetUserSource {
  id: string;
  name: string;
  email: string;
  scopeRole: ScopeRole;
}
export interface AnalyzerSource {
  type: string;
  rp: { mz: number, Resolving_Power: number };
}

// Utility to extract the type of the `args` field from a query/mutation in binding.ts
// Usage: customField(source, args: ArgsFromBinding<CustomType['customField']>)
// (where CustomType is a GraphQL type imported from binding.ts)
export type ArgsFromBinding<TFieldBinding> = TFieldBinding extends (args: infer TArgs) => any ? TArgs : never;

// Utility to infer types for a set of resolvers from binding.ts
// Note that this only checks the *input* types of those resolvers (source, args, context), not the return type
// Usage:
// const Query: FieldResolversFor<CustomType, CustomTypeSource> = {
//   customField(source, args, context, info) {
//     // `source` is inferred to be CustomTypeSource
//     // `args` is inferred to be the type of `customField`'s arguments as specified in binding.ts
//     // `context` is inferred to be Context
//     // `info` is GraphQLResolveInfo
//   }
// }
export type FieldResolversFor<TBinding, TSource> = {
  [field in keyof TBinding]?: GraphQLFieldResolver<TSource, Context, ArgsFromBinding<TBinding[field]>>
}
