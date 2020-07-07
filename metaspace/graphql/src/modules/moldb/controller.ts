import {IResolvers} from 'graphql-tools';
import {UserError} from 'graphql-errors';
import { validateTiptapJson } from '../../utils/tiptap';

import logger from '../../utils/logger';
import {Context} from '../../context';
import {FieldResolversFor} from '../../bindingTypes';
import {MolecularDB as MolecularDbModel} from './model';
import {MolecularDB, Mutation, Query} from '../../binding';
import {smApiCreateDatabase, smApiUpdateDatabase, smApiDeleteDatabase} from '../../utils/smApi/databases';
import {assertImportFileIsValid} from './util/assertImportFileIsValid';
import {MolecularDbRepository} from './MolecularDbRepository';
import config from '../../utils/config';
import {assertUserBelongsToGroup} from './util/assertUserBelongsToGroup';

const MolecularDbResolvers: FieldResolversFor<MolecularDB, MolecularDbModel> = {
  async createdDT(database, args, ctx: Context): Promise<string> {
    return database.createdDT.toISOString();
  },

  async default(database, args, ctx: Context): Promise<boolean> {
    return config.defaults.moldb_names.includes(database.name);
  },

  async hidden(database, args, ctx: Context): Promise<boolean> {
    return database.archived || !database.isPublic;
  },
};

const QueryResolvers: FieldResolversFor<Query, void> = {
  async molecularDatabases(source, { onlyUsable }, ctx): Promise<MolecularDbModel[]> {
    const repository = ctx.entityManager.getCustomRepository(MolecularDbRepository);
    return !ctx.isAdmin && onlyUsable
      ? await repository.findUsableDatabases(ctx.user)
      : await repository.findVisibleDatabases(ctx.user);
  },

  async getMolecularDB(source, { databaseId }, ctx): Promise<MolecularDbModel> {
    const repository = ctx.entityManager.getCustomRepository(MolecularDbRepository);
    return repository.findDatabaseById(ctx, databaseId);
  },
};

const assertUserCanEditMolecularDB = async (ctx: Context, databaseId: number) => {
  const database = await ctx.entityManager.getCustomRepository(MolecularDbRepository)
    .findDatabaseById(ctx, databaseId);
  if (ctx.isAdmin) {
    return;
  }

  if (database.groupId == null) {
    throw new UserError('Only admins can manage Metaspace public databases');
  }

  assertUserBelongsToGroup(ctx, database.groupId);
};

const MutationResolvers: FieldResolversFor<Mutation, void>  = {

  async createMolecularDB(source, { databaseDetails }, ctx): Promise<MolecularDbModel> {
    logger.info(`User ${ctx.user.id} is creating molecular database ${JSON.stringify(databaseDetails)}`);
    const groupId = databaseDetails.groupId as string;
    assertUserBelongsToGroup(ctx, groupId);
    if (databaseDetails.citation != null) {
      validateTiptapJson(databaseDetails.citation, 'citation')
    }

    await assertImportFileIsValid(databaseDetails.filePath);

    const { id } = await smApiCreateDatabase({ ...databaseDetails, groupId });
    return await ctx.entityManager.getCustomRepository(MolecularDbRepository).findDatabaseById(ctx, id);
  },

  async updateMolecularDB(source, { databaseId, databaseDetails }, ctx): Promise<MolecularDbModel> {
    logger.info(`User ${ctx.user.id} is updating molecular database ${JSON.stringify(databaseDetails)}`);
    await assertUserCanEditMolecularDB(ctx, databaseId);
    if (databaseDetails.citation != null) {
      validateTiptapJson(databaseDetails.citation, 'citation')
    }

    const { id } = await smApiUpdateDatabase(databaseId, databaseDetails);
    return await ctx.entityManager.getCustomRepository(MolecularDbRepository).findDatabaseById(ctx, id);
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
  MolecularDB: MolecularDbResolvers,
} as IResolvers<any, Context>;
