import {FieldResolversFor} from "../../bindingTypes";
import {Query} from "../../binding";
import {MolecularDB} from "./model";
import config from "../../utils/config";
import logger from "../../utils/logger";
import {IResolvers} from "graphql-tools";
import {Context} from "../../context";


const QueryResolvers: FieldResolversFor<Query, void> = {
  async molecularDatabasesV2(source, {hideArchived}, ctx) {
      const molDBs = await ctx.entityManager.getRepository(MolecularDB).find();
      return molDBs.map(molDB => {
        return {
          ...molDB,
          default: config.defaults.moldb_names.includes(molDB.name),
          hidden: molDB.archived,
        }
      });
  },
};

export const Resolvers = {
  Query: QueryResolvers
} as IResolvers<any, Context>;
