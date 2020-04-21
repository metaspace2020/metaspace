import {FieldResolversFor} from '../../bindingTypes';
import {MolecularDB, Mutation, Query} from '../../binding';
import {MolecularDB as MolecularDbModel} from './model';
import config from '../../utils/config';
import logger from '../../utils/logger';
import {IResolvers} from 'graphql-tools';
import {Context} from '../../context';
import {UserError} from 'graphql-errors';
import {smApiCreateDatabase, smApiUpdateDatabase, smApiDeleteDatabase} from '../../utils/smApi/databases';
import {In} from 'typeorm';
import {assertImportFileIsValid} from './util/assertImportFileIsValid';


const mapToGqlMolecularDb = (molDB: MolecularDbModel): MolecularDB => {
  return {
    ...molDB,
    default: config.defaults.moldb_names.includes(molDB.name),
    hidden: molDB.archived || !molDB.public,
  }
};

const QueryResolvers: FieldResolversFor<Query, void> = {
  async molecularDatabases(source, { hideArchived }, ctx): Promise<MolecularDB[]> {
    const orCond = [];
    if (!ctx.isAdmin) {
      orCond.push({ public: true });
      if (ctx.user.groupIds && ctx.user.groupIds.length > 0) {
        orCond.push({ groupId: In(ctx.user.groupIds) });
      }
    }
    let molDBs = await ctx.entityManager.getRepository(MolecularDbModel).find(
      { where: orCond, order: { name: 'ASC' } });
    if (hideArchived) {
      molDBs = molDBs.filter(db => !db.archived)
    }
    return molDBs.map(db => mapToGqlMolecularDb(db));
  },
};

const assertUserBelongsToGroup = (ctx: Context, groupId: string) => {
  if (!ctx.isAdmin) {
    ctx.getUserIdOrFail(); // Exit early if not logged in
    if (!ctx.user.groupIds || !ctx.user.groupIds.includes(groupId)) {
      throw new UserError(`Unauthorized`);
    }
  }
};

const assertUserCanEditMolecularDB = async (ctx: Context, databaseId: number) => {
  const molDB = await ctx.entityManager.getRepository(MolecularDbModel).findOneOrFail({ id: databaseId });
  assertUserBelongsToGroup(ctx, molDB.groupId);
};

const MutationResolvers: FieldResolversFor<Mutation, void>  = {
  async createMolecularDB(source, { databaseDetails }, ctx): Promise<MolecularDB> {
    logger.info(`User ${ctx.user.id} is creating molecular database ${JSON.stringify(databaseDetails)}`);
    const groupId = databaseDetails.groupId as string;
    assertUserBelongsToGroup(ctx, groupId);

    await assertImportFileIsValid(databaseDetails.filePath);

    const { id } = await smApiCreateDatabase({ ...databaseDetails, groupId });
    const molDB = await ctx.entityManager.getRepository(MolecularDbModel).findOneOrFail({ id });
    return mapToGqlMolecularDb(molDB);
  },

  async updateMolecularDB(source, { databaseId, databaseDetails }, ctx): Promise<MolecularDB> {
    logger.info(`User ${ctx.user.id} is updating molecular database ${JSON.stringify(databaseDetails)}`);
    await assertUserCanEditMolecularDB(ctx, databaseId);

    const { id } = await smApiUpdateDatabase(databaseId, databaseDetails);
    const molDB = await ctx.entityManager.getRepository(MolecularDbModel).findOneOrFail({ id });
    return mapToGqlMolecularDb(molDB);
  },

  async deleteMolecularDB(source, { databaseId}, ctx): Promise<Boolean> {
    logger.info(`User ${ctx.user.id} is deleting molecular database ${databaseId}`);
    if (!ctx.isAdmin) {
      throw new UserError(`Unauthorized`);
    }

    await smApiDeleteDatabase(databaseId);
    return true;
  },
};

export const Resolvers = {
  Query: QueryResolvers,
  Mutation: MutationResolvers,
} as IResolvers<any, Context>;
