declare module 'graphql-errors' {
  import { IResolverOptions } from 'graphql-tools/dist/Interfaces'
  import { GraphQLObjectType, GraphQLSchema } from 'graphql'

  class UserError extends Error {}
  function maskErrors(thing: GraphQLSchema | GraphQLObjectType | IResolverOptions, fn?: (err: Error) => Error): void;
}
