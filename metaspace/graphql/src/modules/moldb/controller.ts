import {IResolvers} from 'graphql-tools';
import {UserError} from 'graphql-errors';
import { validateTiptapJson } from '../../utils/tiptap';

import logger from '../../utils/logger';
import {Context} from '../../context';
import {FieldResolversFor} from '../../bindingTypes';
import {MolecularDB, Mutation, Query} from '../../binding';
import {smApiCreateDatabase, smApiUpdateDatabase, smApiDeleteDatabase} from '../../utils/smApi/databases';
import {assertImportFileIsValid} from './util/assertImportFileIsValid';
import {mapToMolecularDB} from './util/mapToMolecularDB';
import {MolecularDbRepository} from './MolecularDbRepository';


const QueryResolvers: FieldResolversFor<Query, void> = {
  async molecularDatabases(source, { hideArchived }, ctx): Promise<MolecularDB[]> {
    let databases = await ctx.entityManager.getCustomRepository(MolecularDbRepository).findDatabases(ctx.user);
    if (hideArchived) {
      databases = databases.filter(db => !db.archived)
    }
    return databases.map(db => mapToMolecularDB(db));
  },
  async getMolecularDB(source, { databaseId }, ctx): Promise<MolecularDB> {
    const database = await ctx.entityManager.getCustomRepository(MolecularDbRepository)
      .findDatabaseById(ctx, databaseId);
    return mapToMolecularDB(database);
  }
};

const assertUserBelongsToGroup = (ctx: Context, groupId: string) => {
  ctx.getUserIdOrFail(); // Exit early if not logged in

  if (ctx.isAdmin) {
    return;
  }

  if (!ctx.user.groupIds || !ctx.user.groupIds.includes(groupId)) {
    throw new UserError(`Unauthorized`);
  }
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

  async createMolecularDB(source, { databaseDetails }, ctx): Promise<MolecularDB> {
    logger.info(`User ${ctx.user.id} is creating molecular database ${JSON.stringify(databaseDetails)}`);
    const groupId = databaseDetails.groupId as string;
    assertUserBelongsToGroup(ctx, groupId);
    if (databaseDetails.citation != null) {
      validateTiptapJson(databaseDetails.citation, 'citation')
    }

    await assertImportFileIsValid(databaseDetails.filePath);

    const { id } = await smApiCreateDatabase({ ...databaseDetails, groupId });
    const database = await ctx.entityManager.getCustomRepository(MolecularDbRepository).findDatabaseById(ctx, id);
    return mapToMolecularDB(database);
  },

  async updateMolecularDB(source, { databaseId, databaseDetails }, ctx): Promise<MolecularDB> {
    logger.info(`User ${ctx.user.id} is updating molecular database ${JSON.stringify(databaseDetails)}`);
    await assertUserCanEditMolecularDB(ctx, databaseId);
    if (databaseDetails.citation != null) {
      validateTiptapJson(databaseDetails.citation, 'citation')
    }

    const { id } = await smApiUpdateDatabase(databaseId, databaseDetails);
    const database = await ctx.entityManager.getCustomRepository(MolecularDbRepository)
      .findDatabaseById(ctx, id);
    return mapToMolecularDB(database);
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
