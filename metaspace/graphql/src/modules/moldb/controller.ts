import {FieldResolversFor} from "../../bindingTypes";
import {MolecularDB, Mutation, Query} from "../../binding";
import {MolecularDB as MolecularDbModel} from "./model";
import config from "../../utils/config";
import logger from "../../utils/logger";
import {IResolvers} from "graphql-tools";
import {Context} from "../../context";
import {UserError} from "graphql-errors";
import {smApiCreateDatabase, smApiUpdateDatabase, smApiDeleteDatabase} from "../../utils/smApi/databases";


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

const assertUserBelongsToGroup = (ctx: Context, groupId: string) => {
  ctx.getUserIdOrFail(); // Exit early if not logged in
  if (!ctx.user.groupIds || !ctx.user.groupIds.includes(groupId)) {
    throw new UserError(`Unauthorized`);
  }
};

const assertUserCanEditMolecularDB = async (ctx: Context, databaseId: number) => {
  const molDB = await ctx.entityManager.getRepository(MolecularDbModel).findOneOrFail({ id: databaseId });
  assertUserBelongsToGroup(ctx, molDB.groupId);
};

const MutationResolvers: FieldResolversFor<Mutation, void>  = {
  async createMolecularDB(source, { databaseDetails }, ctx): Promise<MolecularDB> {
    const groupId = <string>databaseDetails.groupId;
    assertUserBelongsToGroup(ctx, groupId);

    const { id } = await smApiCreateDatabase({ ...databaseDetails, groupId });
    const molDB = await ctx.entityManager.getRepository(MolecularDbModel).findOneOrFail({ id });
    return addFields(molDB);
  },

  async updateMolecularDB(source, { databaseId, databaseDetails }, ctx): Promise<MolecularDB> {
    await assertUserCanEditMolecularDB(ctx, databaseId);

    const molDB = await smApiUpdateDatabase(databaseId, databaseDetails);
    return addFields(molDB);
  },

  async deleteMolecularDB(source, { databaseId}, ctx): Promise<Boolean> {
    await assertUserCanEditMolecularDB(ctx, databaseId);

    await smApiDeleteDatabase(databaseId);
    return true;
  },
};

export const Resolvers = {
  Query: QueryResolvers,
  Mutation: MutationResolvers,
} as IResolvers<any, Context>;
