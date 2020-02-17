import {FieldResolversFor} from "../../bindingTypes";
import {Query} from "../../binding";
import {MolecularDB} from "./model";
import config from "../../utils/config";
import logger from "../../utils/logger";
import {IResolvers} from "graphql-tools";
import {Context} from "../../context";


const QueryResolvers: FieldResolversFor<Query, void> = {
  async molecularDatabases(source, {hideArchived}, ctx) {
    let molDBs = await ctx.entityManager.getRepository(MolecularDB).find();
    if (hideArchived) {
      molDBs = molDBs.filter(db => !db.archived)
    }
    return molDBs.map(db => {
      return {
        ...db,
        default: config.defaults.moldb_names.includes(db.name),
        hidden: db.archived || !db.public,
      }
    });
  },
};

export const Resolvers = {
  Query: QueryResolvers
} as IResolvers<any, Context>;
