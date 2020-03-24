import {FieldResolversFor} from "../../bindingTypes";
import {MolecularDB, Mutation, Query} from "../../binding";
import {MolecularDB as MolecularDbModel} from "./model";
import config from "../../utils/config";
import logger from "../../utils/logger";
import {IResolvers} from "graphql-tools";
import {Context} from "../../context";
import {UserError} from "graphql-errors";


const addFields = (molDB: MolecularDbModel): any => {
  return {
    ...molDB,
    default: config.defaults.moldb_names.includes(molDB.name),
    hidden: molDB.archived || !molDB.public,
  }
};


const QueryResolvers: FieldResolversFor<Query, void> = {
  async molecularDatabases(source, {hideArchived}, ctx): Promise<MolecularDB[]> {
    let molDBs = await ctx.entityManager.getRepository(MolecularDbModel).find();
    if (hideArchived) {
      molDBs = molDBs.filter(db => !db.archived)
    }
    return molDBs.map(db => addFields(db));
  },
};

const MutationResolvers: FieldResolversFor<Mutation, void>  = {
  async createMolecularDB(source, { databaseDetails }, ctx): Promise<MolecularDB> {
    ctx.getUserIdOrFail(); // Exit early if not logged in

    // const { groupId } = databaseDetails;
    // assert groupId in ctx.user.groupIds

    // call sm-api and handle errors
    // throw new UserError(JSON.stringify({ 'type': 'already_exists' }));
    // use id returned by sm-api

    const molDB = await ctx.entityManager.getRepository(MolecularDbModel).findOneOrFail({id: 0});
    return addFields(molDB);
  }
};

export const Resolvers = {
  Query: QueryResolvers,
  Mutation: MutationResolvers,
} as IResolvers<any, Context>;
