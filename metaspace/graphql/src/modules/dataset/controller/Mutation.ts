import * as jsondiffpatch from 'jsondiffpatch';
import config from '../../../utils/config';
import logger from '../../../utils/logger';
import * as Ajv from 'ajv';
import {UserError} from 'graphql-errors';
import {EntityManager} from 'typeorm';
import * as moment from 'moment';
import * as _ from 'lodash';

import {fetchMolecularDatabases} from '../../../utils/molDb';
import {EngineDS, fetchEngineDS} from '../../../utils/knexDb';

import {smAPIRequest} from '../../../utils';
import {UserProjectRoleOptions as UPRO} from '../../project/model';
import {UserGroup as UserGroupModel, UserGroupRoleOptions} from '../../group/model';
import {Dataset as DatasetModel, DatasetProject as DatasetProjectModel} from '../model';
import {DatasetCreateInput, DatasetUpdateInput, Int, Mutation} from '../../../binding';
import {Context, ContextUser} from '../../../context';
import {FieldResolversFor} from '../../../bindingTypes';
import {getUserProjectRoles} from '../../../utils/db';
import {metadataSchemas} from '../../../../metadataSchemas/metadataRegistry';
import {getDatasetForEditing} from '../operation/getDatasetForEditing';
import {deleteDataset} from '../operation/deleteDataset';
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

async function molDBsExist(molDBNames: string[]) {
  const existingMolDBs = await fetchMolecularDatabases(),
    existingMolDBNames = new Set<string>(existingMolDBs.map((mol_db: any) => mol_db.name));
  for (let name of molDBNames) {
    if (!existingMolDBNames.has(name))
      throw new UserError(JSON.stringify({
        'type': 'wrong_moldb_name',
        'moldb_name': name
      }));
  }
}

export function processingSettingsChanged(ds: EngineDS, update: DatasetUpdateInput & {metadata: MetadataRoot}) {
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
      if (diffObj.op !== 'move') {  // ignore permuations in arrays
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
  const userGroup = await entityManager.getRepository(UserGroupModel).findOne({
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

interface SaveDSArgs {
  dsId?: string;
  submitterId: string;
  groupId?: string;
  projectIds?: string[];
  principalInvestigator?: {name: string, email: string};
}

const saveDS = async (entityManager: EntityManager, args: SaveDSArgs, requireInsert = false) => {
  const {dsId, submitterId, groupId, projectIds, principalInvestigator} = args;
  const groupUpdate = groupId === undefined ? {}
    : groupId === null ? { groupId: null, groupApproved: false }
      : { groupId, groupApproved: await isMemberOf(entityManager, submitterId, groupId) };
  const piUpdate = principalInvestigator === undefined ? {}
    : principalInvestigator === null ? { piName: null, piEmail: null }
    : { piName: principalInvestigator.name, piEmail: principalInvestigator.email };
  const dsUpdate = {
    id: dsId,
    userId: submitterId,
    ...groupUpdate,
    ...piUpdate,
  };

  if (requireInsert) {
    // When creating new datasets, use INSERT so that SQL prevents the same ID from being used twice
    await entityManager.getRepository(DatasetModel).insert(dsUpdate);
  } else {
    await entityManager.getRepository(DatasetModel).save(dsUpdate);
  }

  if (projectIds != null) {
    const datasetProjectRepo = entityManager.getRepository(DatasetProjectModel);
    const existingDatasetProjects = await datasetProjectRepo.find({ datasetId: dsId });
    const userProjectRoles = await getUserProjectRoles(entityManager, submitterId);
    const savePromises = projectIds
      .map((projectId) => ({
        projectId,
        approved: [UPRO.MEMBER, UPRO.MANAGER].includes(userProjectRoles[projectId]),
        existing: existingDatasetProjects.find(dp => dp.projectId === projectId),
      }))
      .filter(({approved, existing}) => existing == null || existing.approved !== approved)
      .map(async ({projectId, approved}) => {
        await datasetProjectRepo.save({ datasetId: dsId, projectId, approved });
      });
    const deletePromises = existingDatasetProjects
      .filter(({projectId}) => !projectIds.includes(projectId))
      .map(async ({projectId}) => { await datasetProjectRepo.delete({ datasetId: dsId, projectId }); });

    await Promise.all([...savePromises, ...deletePromises]);
  }
};

const assertCanCreateDataset = (user: ContextUser | null) => {
  if (!user)
    throw new UserError(`Not authenticated`);
};

const newDatasetId = () => {
  const dt = moment();
  return `${dt.format('YYYY-MM-DD')}_${dt.format('HH')}h${dt.format('mm')}m${dt.format('ss')}s`;
};

type CreateDatasetArgs = {
  id?: string,
  input: DatasetCreateInput,
  priority?: Int,
  force?: boolean,           // Only used by reprocess
  delFirst?: boolean,        // Only used by reprocess
  skipValidation?: boolean,  // Only used by reprocess
};
const createDataset = async (args: CreateDatasetArgs, ctx: Context) => {
  const {input, priority, force, delFirst, skipValidation} = args;
  const {user, entityManager, isAdmin, getUserIdOrFail} = ctx;
  const dsId = args.id || newDatasetId();
  const dsIdWasSpecified = !!args.id;
  const userId = getUserIdOrFail();

  logger.info(`Creating dataset '${dsId}' by '${userId}' user ...`);
  let ds;
  if (dsIdWasSpecified) {
    ds = await getDatasetForEditing(entityManager, user, dsId);
  } else {
    assertCanCreateDataset(user);
  }

  const metadata = JSON.parse(input.metadataJson);
  if (!skipValidation || !isAdmin) {
    validateMetadata(metadata);
  }
  // TODO: Many of the inputs are mistyped because of bugs in graphql-binding that should be reported and/or fixed
  await molDBsExist(input.molDBs as any || []);

  const {submitterId, groupId, projectIds, principalInvestigator} = input;
  const saveDSArgs = {
    dsId,
    // Only admins can specify the submitterId
    submitterId: (isAdmin ? submitterId as (string | undefined) : null) || (ds && ds.userId) || userId,
    groupId: groupId as (string | undefined),
    projectIds: projectIds as string[],
    principalInvestigator
  };
  await saveDS(entityManager, saveDSArgs, !dsIdWasSpecified);

  const url = `/v1/datasets/${dsId}/add`;
  await smAPIRequest(url, {
    doc: {...input, metadata},
    priority: priority,
    force: force,
    del_first: delFirst,
    email: user!.email,
  });

  logger.info(`Dataset '${dsId}' was created`);
  return JSON.stringify({ dsId, status: 'success' });
};

const MutationResolvers: FieldResolversFor<Mutation, void>  = {

  reprocessDataset: async (_, args, ctx) => {
    const {id, priority} = args;
    const ds = await fetchEngineDS({id});
    if (ds === undefined)
      throw new UserError('DS does not exist');

    return await createDataset({
      id: id,
      input: ds as any, // TODO: map this properly
      priority: priority,
      force: true,
      skipValidation: true,
      delFirst: true,
    }, ctx);
  },

  createDataset: async (_, args, ctx: Context) => {
    return await createDataset(args, ctx);
  },

  updateDataset: async (source, args, {user, entityManager, isAdmin}) => {
    const {id: dsId, input: update, reprocess, skipValidation, delFirst, force, priority} = args;

    logger.info(`User '${user && user.id}' updating '${dsId}' dataset...`);
    const ds = await getDatasetForEditing(entityManager, user, dsId);

    let metadata;
    if (update.metadataJson) {
      metadata = JSON.parse(update.metadataJson);
      if (!skipValidation || !isAdmin) {
        validateMetadata(metadata);
      }
    }

    const engineDS = await fetchEngineDS({id: dsId});
    const {newDB, procSettingsUpd} = await processingSettingsChanged(engineDS, {...update, metadata});
    const reprocessingNeeded = newDB || procSettingsUpd;

    const {submitterId, groupId, projectIds, principalInvestigator} = update;
    const saveDSArgs = {
      dsId,
      submitterId: (isAdmin ? submitterId as (string | undefined) : null) || ds.userId,
      groupId: groupId as (string | undefined),
      projectIds: projectIds as string[],
      principalInvestigator
    };

    let smAPIResp;
    if (reprocess) {
      await saveDS(entityManager, saveDSArgs);
      smAPIResp = await smAPIRequest(`/v1/datasets/${dsId}/add`, {
        doc: {...engineDS, ...update, ...(metadata ? {metadata} : {})},
        del_first: procSettingsUpd || delFirst,  // delete old results if processing settings changed
        priority: priority,
        force: force,
        email: user!.email,
      });
    }
    else {
      if (reprocessingNeeded) {
        throw new UserError(JSON.stringify({
          'type': 'reprocessing_needed',
          'hint': `Reprocessing needed. Provide 'reprocess' flag.`
        }));
      }
      else {
        await saveDS(entityManager, saveDSArgs);
        smAPIResp = await smAPIRequest(`/v1/datasets/${dsId}/update`, {
          doc: {
            ..._.omit(update, 'metadataJson'),
            ...(metadata ? {metadata} : {})
          },
          priority: priority,
          force: force,
        });
      }
    }

    logger.info(`Dataset '${dsId}' was updated`);
    return JSON.stringify(smAPIResp);
  },

  deleteDataset: async (_, args, {user, entityManager}) => {
    const {id: dsId, force} = args;
    if (user == null) {
      throw new UserError('Unauthorized');
    }
    const resp = await deleteDataset(entityManager, user, dsId, {force});
    return JSON.stringify(resp);
  },

  addOpticalImage: async (_, {input}, {user, entityManager, getUserIdOrFail}) => {
    const {datasetId: dsId, transform} = input;
    let {imageUrl} = input;

    logger.info(`User '${getUserIdOrFail()}' adding optical image to '${dsId}' dataset...`);
    await getDatasetForEditing(entityManager, user, dsId);
    // TODO support image storage running on a separate host
    const url = `http://localhost:${config.img_storage_port}${imageUrl}`;
    const resp = await smAPIRequest(`/v1/datasets/${dsId}/add-optical-image`, {
      url, transform
    });

    logger.info(`Optical image was added to '${dsId}' dataset`);
    return JSON.stringify(resp);
  },

  deleteOpticalImage: async (_, args, {user, entityManager, getUserIdOrFail}) => {
    const {datasetId: dsId} = args;

    logger.info(`User '${getUserIdOrFail()}' deleting optical image from '${dsId}' dataset...`);
    await getDatasetForEditing(entityManager, user, dsId);
    const resp = await smAPIRequest(`/v1/datasets/${dsId}/del-optical-image`, {});

    logger.info(`Optical image was deleted from '${dsId}' dataset`);
    return JSON.stringify(resp);
  }
};

export default MutationResolvers;
