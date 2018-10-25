const jsondiffpatch = require('jsondiffpatch'),
  config = require('config'),
  Ajv = require('ajv'),
  {UserError} = require('graphql-errors'),
  _ = require('lodash'),
  {In} = require('typeorm');

const {logger, fetchEngineDS, fetchMolecularDatabases} = require('./utils.js'),
  {Dataset: DatasetModel, DatasetProject: DatasetProjectModel} = require('./src/modules/dataset/model'),
  {UserGroup: UserGroupModel, UserGroupRoleOptions} = require('./src/modules/group/model'),
  {UserProjectRoleOptions: UPRO} = require('./src/modules/project/model'),
  metadataMapping = require('./metadataSchemas/metadataMapping').default,
  {smAPIRequest} = require('./src/utils');

function isEmpty(obj) {
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

function trimEmptyFields(schema, value) {
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

function validateMetadata(metadata) {
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

async function molDBsExist(molDBNames) {
  const existingMolDBs = await fetchMolecularDatabases({hideDeprecated: false}),
    existingMolDBNames = new Set(existingMolDBs.map((mol_db) => mol_db.name));
  for (let name of molDBNames) {
    if (!existingMolDBNames.has(name))
      throw new UserError(JSON.stringify({
        'type': 'wrong_moldb_name',
        'moldb_name': name
      }));
  }
}

function processingSettingsChanged(ds, update) {
  let newDB = false, procSettingsUpd = false, metaDiff = null;
  if (update.molDBs)
    newDB = true;
  if (update.adducts)
    procSettingsUpd = true;

  if (update.metadata) {
    const metaDelta = jsondiffpatch.diff(ds.metadata, update.metadata),
      metaDiff = jsondiffpatch.formatters.jsonpatch.format(metaDelta);

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

const isMemberOf = async (connection, userId, groupId) => {
  const userGroup = await connection.getRepository(UserGroupModel).findOne({
    userId,
    groupId
  });
  let isMember = false;
  if (userGroup) {
    isMember = [UserGroupRoleOptions.MEMBER,
      UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR].includes(userGroup.role);
  }
  return isMember;
};

const saveDS = async (connection, args, currentUserRoles) => {
  const {dsId, submitterId, groupId, projectIds, principalInvestigator} = args;
  const dsUpdate = {
    id: dsId,
    userId: submitterId,
    groupId: groupId,
    groupApproved: groupId != null ? await isMemberOf(connection, submitterId, groupId) : false,
    piName: principalInvestigator ? principalInvestigator.name : undefined,
    piEmail: principalInvestigator ? principalInvestigator.email : undefined
  };
  await connection.getRepository(DatasetModel).save(dsUpdate);

  if (projectIds != null && projectIds.length > 0) {
    const datasetProjectRepo = connection.getRepository(DatasetProjectModel);
    const existingDatasetProjects = await datasetProjectRepo.find({ datasetId: dsId });
    const savePromises = projectIds.map(async (projectId) => {
      const approved = [UPRO.MEMBER, UPRO.MANAGER].includes(currentUserRoles[projectId]);
      const existing = existingDatasetProjects.find(dp => dp.projectId === projectId);
      if (existing == null || existing.approved !== approved) {
        return await datasetProjectRepo.save({ datasetId: dsId, projectId, approved });
      } else {
        return Promise.resolve();
      }
    });
    const deletePromises = existingDatasetProjects
      .filter(({projectId}) => !projectIds.includes(projectId))
      .map(async ({projectId}) => await datasetProjectRepo.delete({ datasetId: dsId, projectId }));

    await Promise.all([...savePromises, ...deletePromises]);
  }
};

const assertCanEditDataset = async (connection, user, dsId) => {
  if (!user)
    throw new UserError('Access denied');

  if (user.role === 'admin')
    return;

  if (dsId) {
    const ds = await connection.getRepository(DatasetModel).findOne({
      id: dsId
    });
    if (!ds)
      throw new UserError(`DS ${dsId} does not exist`);

    if (user.id !== ds.userId)
      throw new UserError('Access denied');
  }
  else {
    throw new UserError(`DS id not provided`);
  }
};

const assertCanCreateDataset = (user) => {
  if (!user)
    throw new UserError(`Not authenticated`);
};

module.exports = {
  processingSettingsChanged,

  Mutation: {
    create: async (_, args, {user, connection, getCurrentUserProjectRoles}) => {
      const {input, priority} = args;
      let {id: dsId} = args;

      logger.info(`Creating dataset '${dsId}' by '${user.id}' user ...`);
      if (dsId)
        await assertCanEditDataset(connection, user, dsId);
      else
        assertCanCreateDataset(user);

      input.metadata = JSON.parse(input.metadataJson);
      validateMetadata(input.metadata);
      await molDBsExist(input.molDBs);

      const url = dsId ? `/v1/datasets/${dsId}/add` : '/v1/datasets/add';
      const smAPIResp = await smAPIRequest(url, {
        doc: input,
        priority: priority,
        email: user.email,
      });
      // TODO: generate dsId here and save it before calling SM API
      dsId = smAPIResp['ds_id'];

      const {submitterId, groupId, projectIds, principalInvestigator} = input;
      const saveDSArgs = {dsId, submitterId, groupId, projectIds, principalInvestigator};
      await saveDS(connection, saveDSArgs, await getCurrentUserProjectRoles());

      logger.info(`Dataset '${dsId}' was created`);
      return JSON.stringify({ dsId, status: 'success' });
    },

    update: async (_, args, {user, connection, getCurrentUserProjectRoles}) => {
      const {id: dsId, input: update, reprocess, delFirst, force, priority} = args;

      logger.info(`User '${user.id}' updating '${dsId}' dataset...`);
      await assertCanEditDataset(connection, user, dsId);

      if (update.metadataJson) {
        update.metadata = JSON.parse(update.metadataJson);
        validateMetadata(update.metadata);
      }

      const engineDS = await fetchEngineDS({id: dsId});
      const {newDB, procSettingsUpd} = await processingSettingsChanged(engineDS, update);
      const reprocessingNeeded = newDB || procSettingsUpd;

      const {submitterId, groupId, projectIds, principalInvestigator} = update;
      const saveDSArgs = {dsId, submitterId, groupId, projectIds, principalInvestigator};

      let smAPIResp;
      if (reprocess) {
        await saveDS(connection, saveDSArgs, await getCurrentUserProjectRoles());
        smAPIResp = await smAPIRequest(`/v1/datasets/${dsId}/add`, {
          doc: {...engineDS, ...update},
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
          await saveDS(connection, saveDSArgs, await getCurrentUserProjectRoles());
          smAPIResp = await smAPIRequest(`/v1/datasets/${dsId}/update`, {
            doc: update,
            priority: priority,
            force: force,
          });
        }
      }

      logger.info(`Dataset '${dsId}' was updated`);
      return JSON.stringify(smAPIResp);
    },

    delete: async (_, args, {user, connection}) => {
      const {id: dsId, priority} = args;

      logger.info(`User '${user.id}' deleting '${dsId}' dataset...`);
      await assertCanEditDataset(connection, user, dsId);

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

    addOpticalImage: async (_, {input}, {user, connection}) => {
      const {datasetId: dsId, transform} = input;
      let {imageUrl} = input;

      logger.info(`User '${user.id}' adding optical image to '${dsId}' dataset...`);
      await assertCanEditDataset(connection, user, dsId);
        // TODO support image storage running on a separate host
      const url = `http://localhost:${config.img_storage_port}${imageUrl}`;
      const resp = await smAPIRequest(`/v1/datasets/${dsId}/add-optical-image`, {
        url, transform
      });

      logger.info(`Optical image was added to '${dsId}' dataset`);
      return JSON.stringify(resp);
    },

    deleteOpticalImage: async (_, args, {user, connection}) => {
      const {datasetId: dsId} = args;

      logger.info(`User '${user.id}' deleting optical image from '${dsId}' dataset...`);
      await assertCanEditDataset(connection, user, dsId);
      const resp = await smAPIRequest(`/v1/datasets/${dsId}/del-optical-image`, {});

      logger.info(`Optical image was deleted from '${dsId}' dataset`);
      return JSON.stringify(resp);
    }
  }
};
