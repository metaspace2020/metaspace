import * as jsondiffpatch from 'jsondiffpatch';
import config from '../../../utils/config';
import logger from '../../../utils/logger';
import * as Ajv from 'ajv';
import {UserError} from 'graphql-errors';
import {EntityManager, In, Not} from 'typeorm';
import * as moment from 'moment';
import * as _ from 'lodash';

import {smAPIRequest} from '../../../utils';
import {UserProjectRoleOptions as UPRO} from '../../project/model';
import {PublicationStatusOptions as PSO} from '../../project/PublicationStatusOptions';
import {UserGroup as UserGroupModel, UserGroupRoleOptions} from '../../group/model';
import {Dataset as DatasetModel, DatasetProject as DatasetProjectModel} from '../model';
import {DatasetCreateInput, DatasetUpdateInput, Int, Mutation} from '../../../binding';
import {Context, ContextUser} from '../../../context';
import {FieldResolversFor} from '../../../bindingTypes';
import {getUserProjectRoles} from '../../../utils/db';
import {metadataSchemas} from '../../../../metadataSchemas/metadataRegistry';
import {getDatasetForEditing} from '../operation/getDatasetForEditing';
import {deleteDataset} from '../operation/deleteDataset';
import {verifyDatasetPublicationStatus} from '../operation/verifyDatasetPublicationStatus';
import {EngineDataset} from '../../engine/model';
import {addExternalLink, removeExternalLink} from '../../project/ExternalLink';
import {esDatasetByID} from '../../../../esConnector';
import {MolecularDB} from "../../moldb/model";

type MetadataSchema = any;
type MetadataRoot = any;
type MetadataNode = any;


function isEmpty(obj: any) {
  if (!obj)
    return true;
  if (!(obj instanceof Object))
    return false;
  let empty = true;
  for (var key in obj) {
    if (!isEmpty(obj[key])) {
      empty = false;
      break;
    }
  }
  return empty;
}

function trimEmptyFields(schema: MetadataSchema, value: MetadataNode) {
  if (!(value instanceof Object))
    return value;
  if (Array.isArray(value))
    return value;
  let obj = Object.assign({}, value);
  for (var name in schema.properties) {
    const prop = schema.properties[name];
    if (isEmpty(obj[name]) && (!schema.required || schema.required.indexOf(name) == -1))
      delete obj[name];
    else
      obj[name] = trimEmptyFields(prop, obj[name]);
  }
  return obj;
}

function validateMetadata(metadata: MetadataNode) {
  const ajv = new Ajv({allErrors: true});
  const mdSchema = metadataSchemas[metadata.Data_Type];
  const validator = ajv.compile(mdSchema);
  const cleanValue = trimEmptyFields(mdSchema, metadata);
  validator(cleanValue);
  const validationErrors = validator.errors || [];
  if (validationErrors.length > 0) {
    throw new UserError(JSON.stringify({
      'type': 'failed_validation',
      'validation_errors': validationErrors
    }));
  }
}

async function molDBsExist(entityManager: EntityManager, molDBNames: string[]) {
  const foundMolDBNames = (await entityManager.getRepository(MolecularDB)
    .find({ where: { name: In(molDBNames) } }))
    .map(moldb => moldb.name);

  if (foundMolDBNames.length < molDBNames.length) {
    const missingMolDBNames = molDBNames.map(name => !foundMolDBNames.includes(name));
    throw new UserError(JSON.stringify({
      'type': 'wrong_moldb_name',
      'moldb_name': missingMolDBNames
    }));
  }
}

export function processingSettingsChanged(ds: EngineDataset, update: DatasetUpdateInput & {metadata: MetadataRoot}) {
  let newDB = false, procSettingsUpd = false, metaDiff = null;
  if (update.molDBs)
    newDB = true;

  if (update.adducts || update.neutralLosses || update.chemMods
    || update.ppm || update.numPeaks || update.decoySampleSize
    || update.analysisVersion) {
    procSettingsUpd = true;
  }

  if (update.metadata) {
    const metaDelta = jsondiffpatch.diff(ds.metadata, update.metadata),
      metaDiff = (jsondiffpatch.formatters as any).jsonpatch.format(metaDelta);

    for (let diffObj of metaDiff) {
      if (diffObj.op !== 'move') {  // ignore permutations in arrays
        const procSettingsPaths = [
          '/MS_Analysis/Polarity',
          '/MS_Analysis/Detector_Resolving_Power',
        ];
        for(let path of procSettingsPaths) {
          if (diffObj.path.startsWith(path))
            procSettingsUpd = true;
        }
      }
    }
  }

  return {newDB: newDB, procSettingsUpd: procSettingsUpd, metaDiff: metaDiff}
}

const isMemberOf = async (entityManager: EntityManager, userId: string, groupId: string) => {
  const userGroup = await entityManager.findOne(UserGroupModel, {
    userId,
    groupId
  });
  let isMember = false;
  if (userGroup) {
    isMember = [UserGroupRoleOptions.MEMBER,
      UserGroupRoleOptions.GROUP_ADMIN].includes(userGroup.role);
  }
  return isMember;
};

interface SaveDatasetArgs {
  datasetId?: string;
  submitterId: string;
  groupId?: string;
  projectIds?: string[];
  principalInvestigator?: {name: string, email: string};
}

const saveDataset = async (entityManager: EntityManager, args: SaveDatasetArgs, requireInsert = false) => {
  const {datasetId, submitterId, groupId, projectIds, principalInvestigator} = args;
  const groupUpdate = groupId === undefined ? {}
    : groupId === null ? { groupId: null, groupApproved: false }
      : { groupId, groupApproved: await isMemberOf(entityManager, submitterId, groupId) };
  const piUpdate = principalInvestigator === undefined ? {}
    : principalInvestigator === null ? { piName: null, piEmail: null }
    : { piName: principalInvestigator.name, piEmail: principalInvestigator.email };
  const dsUpdate = {
    id: datasetId,
    userId: submitterId,
    ...groupUpdate,
    ...piUpdate,
  };

  if (requireInsert) {
    // When creating new datasets, use INSERT so that SQL prevents the same ID from being used twice
    await entityManager.insert(DatasetModel, dsUpdate);
  } else {
    await entityManager.save(DatasetModel, dsUpdate);
  }

  if (projectIds != null) {
    const datasetProjectRepo = entityManager.getRepository(DatasetProjectModel);
    const existingDatasetProjects = await datasetProjectRepo.find({ datasetId: datasetId });
    const userProjectRoles = await getUserProjectRoles(entityManager, submitterId);
    const savePromises = projectIds
      .map((projectId) => ({
        projectId,
        approved: [UPRO.MEMBER, UPRO.MANAGER].includes(userProjectRoles[projectId]),
        existing: existingDatasetProjects.find(dp => dp.projectId === projectId),
      }))
      .filter(({approved, existing}) => existing == null || existing.approved !== approved)
      .map(async ({projectId, approved}) => {
        await datasetProjectRepo.save({ datasetId: datasetId, projectId, approved });
      });
    const deletePromises = existingDatasetProjects
      .filter(({ projectId, publicationStatus }) =>
        !projectIds.includes(projectId) && publicationStatus == PSO.UNPUBLISHED
      )
      .map(async ({projectId}) => { await datasetProjectRepo.delete({ datasetId: datasetId, projectId }); });

    await Promise.all([...savePromises, ...deletePromises]);
  }
};

const assertCanCreateDataset = (user: ContextUser) => {
  if (user.id == null)
    throw new UserError(`Not authenticated`);
};

const newDatasetId = () => {
  const dt = moment();
  return `${dt.format('YYYY-MM-DD')}_${dt.format('HH')}h${dt.format('mm')}m${dt.format('ss')}s`;
};

type CreateDatasetArgs = {
  datasetId?: string,
  input: DatasetCreateInput,
  priority?: Int,
  force?: boolean,           // Only used by reprocess
  delFirst?: boolean,        // Only used by reprocess
  skipValidation?: boolean,  // Only used by reprocess
};

const createDataset = async (args: CreateDatasetArgs, ctx: Context) => {
  const {input, priority, force, delFirst, skipValidation} = args;
  const {user, entityManager, isAdmin, getUserIdOrFail} = ctx;
  const datasetId = args.datasetId || newDatasetId();
  const datasetIdWasSpecified = !!args.datasetId;
  const userId = getUserIdOrFail();

  logger.info(`Creating dataset '${datasetId}' by '${userId}' user ...`);
  let dataset;
  if (datasetIdWasSpecified) {
    dataset = await getDatasetForEditing(entityManager, user, datasetId);
  } else {
    assertCanCreateDataset(user);
  }

  const metadata = JSON.parse(input.metadataJson);
  if (!skipValidation || !isAdmin) {
    validateMetadata(metadata);
  }
  // TODO: Many of the inputs are mistyped because of bugs in graphql-binding that should be reported and/or fixed
  await molDBsExist(ctx.entityManager, input.molDBs as any || []);

  const {submitterId, groupId, projectIds, principalInvestigator} = input;
  const saveDSArgs = {
    datasetId,
    // Only admins can specify the submitterId
    submitterId: (isAdmin ? submitterId as (string | undefined) : null) || (dataset && dataset.userId) || userId,
    groupId: groupId as (string | undefined),
    projectIds: projectIds as string[],
    principalInvestigator
  };
  await saveDataset(entityManager, saveDSArgs, !datasetIdWasSpecified);

  const url = `/v1/datasets/${datasetId}/add`;
  await smAPIRequest(url, {
    doc: {...input, metadata},
    priority: priority,
    force: force,
    del_first: delFirst,
    email: user!.email,
  });

  logger.info(`Dataset '${datasetId}' was created`);
  return JSON.stringify({ datasetId, status: 'success' });
};

const MutationResolvers: FieldResolversFor<Mutation, void>  = {

  reprocessDataset: async (source, { id, priority }, ctx: Context) => {
    const engineDataset = await ctx.entityManager.findOne(EngineDataset, id);
    if (engineDataset === undefined)
      throw new UserError('Dataset does not exist');

    return await createDataset({
      datasetId: id,
      input: {
        ...engineDataset,
        metadataJson: JSON.stringify(engineDataset.metadata)
      } as any, // TODO: map this properly
      priority: priority,
      force: true,
      skipValidation: true,
      delFirst: true,
    }, ctx);
  },

  createDataset: async (source, args, ctx: Context) => {
    return await createDataset(args, ctx);
  },

  updateDataset: async (source, args, ctx: Context) => {
    const {id: datasetId, input: update, reprocess, skipValidation, delFirst, force, priority} = args;

    logger.info(`User '${ctx.user.id}' updating '${datasetId}' dataset...`);
    const dataset = await getDatasetForEditing(ctx.entityManager, ctx.user, datasetId);

    let metadata;
    if (update.metadataJson) {
      metadata = JSON.parse(update.metadataJson);
      if (!skipValidation || !ctx.isAdmin) {
        validateMetadata(metadata);
      }
    }

    if (update.isPublic == false || update.projectIds != null) {
      await verifyDatasetPublicationStatus(ctx.entityManager, datasetId);
    }

    const engineDataset = await ctx.entityManager.findOneOrFail(EngineDataset, datasetId);
    const {newDB, procSettingsUpd} = await processingSettingsChanged(engineDataset, {...update, metadata});
    const reprocessingNeeded = newDB || procSettingsUpd;

    const {submitterId, groupId, projectIds, principalInvestigator} = update;
    const saveDatasetArgs = {
      datasetId,
      submitterId: (ctx.isAdmin ? submitterId as (string | undefined) : null) || dataset.userId,
      groupId: groupId as (string | undefined),
      projectIds: projectIds as string[],
      principalInvestigator
    };

    let smAPIResp;
    if (reprocess) {
      await saveDataset(ctx.entityManager, saveDatasetArgs);
      smAPIResp = await smAPIRequest(`/v1/datasets/${datasetId}/add`, {
        doc: {...engineDataset, ...update, ...(metadata ? {metadata} : {})},
        del_first: procSettingsUpd || delFirst,  // delete old results if processing settings changed
        priority: priority,
        force: force,
        email: ctx.user!.email,
      });
    } else {
      if (reprocessingNeeded) {
        throw new UserError(JSON.stringify({
          'type': 'reprocessing_needed',
          'hint': `Reprocessing needed. Provide 'reprocess' flag.`
        }));
      } else {
        await saveDataset(ctx.entityManager, saveDatasetArgs);
        smAPIResp = await smAPIRequest(`/v1/datasets/${datasetId}/update`, {
          doc: {
            ..._.omit(update, 'metadataJson'),
            ...(metadata ? {metadata} : {})
          },
          priority: priority,
          force: force,
        });
      }
    }

    logger.info(`Dataset '${datasetId}' was updated`);
    return JSON.stringify(smAPIResp);
  },

  deleteDataset: async (source, { id: datasetId, force }, ctx: Context) => {
    if (ctx.user.id == null) {
      throw new UserError('Unauthorized');
    }
    await verifyDatasetPublicationStatus(ctx.entityManager, datasetId);
    const resp = await deleteDataset(ctx.entityManager, ctx.user, datasetId, { force });
    return JSON.stringify(resp);
  },

  addOpticalImage: async (source, { input }, ctx: Context) => {
    const {datasetId, transform} = input;
    let {imageUrl} = input;

    logger.info(`User '${ctx.getUserIdOrFail()}' adding optical image to '${datasetId}' dataset...`);
    await getDatasetForEditing(ctx.entityManager, ctx.user, datasetId);
    // TODO support image storage running on a separate host
    const url = `http://localhost:${config.img_storage_port}${imageUrl}`;
    const resp = await smAPIRequest(`/v1/datasets/${datasetId}/add-optical-image`, {
      url, transform
    });

    logger.info(`Optical image was added to '${datasetId}' dataset`);
    return JSON.stringify(resp);
  },

  deleteOpticalImage: async (source, { datasetId }, ctx: Context) => {
    logger.info(`User '${ctx.getUserIdOrFail()}' deleting optical image from '${datasetId}' dataset...`);
    await getDatasetForEditing(ctx.entityManager, ctx.user, datasetId);
    const resp = await smAPIRequest(`/v1/datasets/${datasetId}/del-optical-image`, {});

    logger.info(`Optical image was deleted from '${datasetId}' dataset`);
    return JSON.stringify(resp);
  },

  addDatasetExternalLink: async (
    source,
    {datasetId, provider, link, replaceExisting},
    ctx: Context
  ) => {
    await ctx.entityManager.transaction(async txn => {
      const ds = await getDatasetForEditing(txn, ctx.user, datasetId);
      await txn.update(DatasetModel, ds.id, {
        externalLinks: addExternalLink(ds.externalLinks, provider, link, replaceExisting),
      });
    });

    return await esDatasetByID(datasetId, ctx.user);
  },

  removeDatasetExternalLink: async (
    source,
    {datasetId, provider, link},
    ctx: Context
  ) => {
    await ctx.entityManager.transaction(async txn => {
      const ds = await getDatasetForEditing(txn, ctx.user, datasetId);
      await txn.update(DatasetModel, ds.id, {
        externalLinks: removeExternalLink(ds.externalLinks, provider, link),
      });
    });

    return await esDatasetByID(datasetId, ctx.user);
  },
};

export default MutationResolvers;
