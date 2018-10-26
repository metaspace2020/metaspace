import * as jsondiffpatch from 'jsondiffpatch';
import config from '../../../utils/config';
import * as Ajv from 'ajv';
import {UserError} from 'graphql-errors';
import {Connection, EntityManager} from 'typeorm';
import * as moment from 'moment';

import {fetchEngineDS, logger, fetchMolecularDatabases} from '../../../../utils';

import {smAPIRequest} from '../../../utils';
import metadataMapping from '../../../../metadataSchemas/metadataMapping';
import {UserProjectRoleOptions as UPRO} from '../../project/model';
import {UserGroup as UserGroupModel, UserGroupRoleOptions} from '../../group/model';
import {Dataset as DatasetModel, DatasetProject as DatasetProjectModel} from '../model';
import {DatasetUpdateInput, Mutation} from '../../../binding';
import {Context, ContextUser} from '../../../context';
import {FieldResolversFor} from '../../../bindingTypes';
import {getUserProjectRoles} from '../../../utils/db';

type MetadataSchema = any;
type MetadataRoot = any;
type MetadataNode = any;
type EngineDS = ReturnType<typeof fetchEngineDS> extends Promise<infer T> ? T : never;


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
  const mdType = metadata.Data_Type;
  const mdSchemaPath = `./metadataSchemas/${metadataMapping[mdType]}`;
  const mdSchema = require(mdSchemaPath);
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
  if (update.adducts)
    procSettingsUpd = true;

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

const isMemberOf = async (connection: Connection | EntityManager, userId: string, groupId: string) => {
  const userGroup = await connection.getRepository(UserGroupModel).findOne({
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

const saveDS = async (connection: Connection | EntityManager, args: SaveDSArgs, requireInsert = false) => {
  const {dsId, submitterId, groupId, projectIds, principalInvestigator} = args;
  const dsUpdate = {
    id: dsId,
    userId: submitterId,
    groupId: groupId,
    groupApproved: groupId != null ? await isMemberOf(connection, submitterId, groupId) : false,
    piName: principalInvestigator ? principalInvestigator.name : undefined,
    piEmail: principalInvestigator ? principalInvestigator.email : undefined
  };

  if (requireInsert) {
    // When creating new datasets, use INSERT so that SQL prevents the same ID from being used twice
    await connection.getRepository(DatasetModel).insert(dsUpdate);
  } else {
    await connection.getRepository(DatasetModel).save(dsUpdate);
  }

  if (projectIds != null && projectIds.length > 0) {
    const datasetProjectRepo = connection.getRepository(DatasetProjectModel);
    const existingDatasetProjects = await datasetProjectRepo.find({ datasetId: dsId });
    const userProjectRoles = await getUserProjectRoles(connection, submitterId);
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

const getDatasetForEditing = async (connection: Connection | EntityManager, user: ContextUser | null, dsId: string) => {
  if (!user)
    throw new UserError('Access denied');

  if (!dsId)
    throw new UserError(`DS id not provided`);

  const ds = await connection.getRepository(DatasetModel).findOne({
    id: dsId
  });
  if (!ds)
    throw new UserError(`DS ${dsId} does not exist`);

  if (user.id !== ds.userId && user.role !== 'admin')
    throw new UserError('Access denied');

  return ds;
};

const assertCanCreateDataset = (user: ContextUser | null) => {
  if (!user)
    throw new UserError(`Not authenticated`);
};

const newDatasetId = () => {
  const dt = moment();
  return `${dt.format('YYYY-MM-DD')}_${dt.format('HH')}h${dt.format('mm')}m${dt.format('ss')}s`;
};

const MutationResolvers: FieldResolversFor<Mutation, void>  = {

  // for dev purposes only, not a part of the public API
  reprocessDataset: async (_, args, ctx) => {
    const {id, delFirst, priority} = args;
    const ds = await fetchEngineDS({id});
    if (ds === undefined)
      throw new UserError('DS does not exist');
    // @ts-ignore: this depends on passing through `reprocess`, which isn't on the GraphQL model
    return MutationResolvers.createDataset(_, {
      id: id, input: ds, reprocess: true,
      delFirst: delFirst, priority: priority
    }, ctx);
  },

  createDataset: async (_, args, {user, connection, isAdmin, getCurrentUserProjectRoles, getUserIdOrFail}: Context) => {
    const {input, priority} = args;
    const dsId = args.id || newDatasetId();
    const dsIdWasSpecified = !!args.id;
    const userId = getUserIdOrFail();

    logger.info(`Creating dataset '${dsId}' by '${userId}' user ...`);
    let ds;
    if (dsIdWasSpecified) {
      ds = await getDatasetForEditing(connection, user, dsId);
    } else {
      assertCanCreateDataset(user);
    }

    const metadata = JSON.parse(input.metadataJson);
    validateMetadata(metadata);
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
    await saveDS(connection, saveDSArgs, !dsIdWasSpecified);

    const url = `/v1/datasets/${dsId}/add`;
    await smAPIRequest(url, {
      doc: {...input, metadata},
      priority: priority,
      email: user!.email,
    });

    logger.info(`Dataset '${dsId}' was created`);
    return JSON.stringify({ dsId, status: 'success' });
  },

  updateDataset: async (_, args, {user, connection, isAdmin, getCurrentUserProjectRoles}) => {
    const {id: dsId, input: update, reprocess, delFirst, force, priority} = args;

    logger.info(`User '${user && user.id}' updating '${dsId}' dataset...`);
    const ds = await getDatasetForEditing(connection, user, dsId);

    let metadata;
    if (update.metadataJson) {
      metadata = JSON.parse(update.metadataJson);
      validateMetadata(metadata);
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
      await saveDS(connection, saveDSArgs);
      smAPIResp = await smAPIRequest(`/v1/datasets/${dsId}/add`, {
        doc: {...engineDS, ...update, ...(metadata ? {metadata} : {})},
        delFirst: procSettingsUpd || delFirst,  // delete old results if processing settings changed
        priority: priority,
        force: force,
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
        await saveDS(connection, saveDSArgs);
        smAPIResp = await smAPIRequest(`/v1/datasets/${dsId}/update`, {
          doc: {...update, ...(metadata ? {metadata} : {})},
          priority: priority,
          force: force,
        });
      }
    }

    logger.info(`Dataset '${dsId}' was updated`);
    return JSON.stringify(smAPIResp);
  },

  deleteDataset: async (_, args, {user, connection, getUserIdOrFail}) => {
    const {id: dsId, priority} = args;

    logger.info(`User '${getUserIdOrFail()}' deleting '${dsId}' dataset...`);
    await getDatasetForEditing(connection, user, dsId);

    try {
      await smAPIRequest(`/v1/datasets/${dsId}/del-optical-image`, {});
    }
    catch (err) {
      logger.warn(err);
    }

    await connection.getRepository(DatasetProjectModel).delete({ datasetId: dsId });
    await connection.getRepository(DatasetModel).delete(dsId);
    const resp = await smAPIRequest(`/v1/datasets/${dsId}/delete`, {});

    logger.info(`Dataset '${dsId}' was deleted`);
    return JSON.stringify(resp);
  },

  addOpticalImage: async (_, {input}, {user, connection, getUserIdOrFail}) => {
    const {datasetId: dsId, transform} = input;
    let {imageUrl} = input;

    logger.info(`User '${getUserIdOrFail()}' adding optical image to '${dsId}' dataset...`);
    await getDatasetForEditing(connection, user, dsId);
    // TODO support image storage running on a separate host
    const url = `http://localhost:${config.img_storage_port}${imageUrl}`;
    const resp = await smAPIRequest(`/v1/datasets/${dsId}/add-optical-image`, {
      url, transform
    });

    logger.info(`Optical image was added to '${dsId}' dataset`);
    return JSON.stringify(resp);
  },

  deleteOpticalImage: async (_, args, {user, connection, getUserIdOrFail}) => {
    const {datasetId: dsId} = args;

    logger.info(`User '${getUserIdOrFail()}' deleting optical image from '${dsId}' dataset...`);
    await getDatasetForEditing(connection, user, dsId);
    const resp = await smAPIRequest(`/v1/datasets/${dsId}/del-optical-image`, {});

    logger.info(`Optical image was deleted from '${dsId}' dataset`);
    return JSON.stringify(resp);
  }
};

export default MutationResolvers;
