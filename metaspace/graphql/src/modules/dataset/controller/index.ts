import Mutation from './Mutation';
import Query from './Query';
import Dataset from './Dataset';
import Subscription from './Subscription';
import {IResolvers} from 'graphql-tools';
import {Context} from '../../../context';

export const Resolvers = {
  Mutation,
  Query,
  Dataset,
  Subscription,
} as IResolvers<any, Context>;
