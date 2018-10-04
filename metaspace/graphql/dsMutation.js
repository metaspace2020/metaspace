const jsondiffpatch = require('jsondiffpatch'),
  config = require('config'),
  Ajv = require('ajv'),
  {UserError} = require('graphql-errors'),
  _ = require('lodash');

const {logger, fetchEngineDS, fetchMolecularDatabases} = require('./utils.js'),
  {Dataset: DatasetModel} = require('./src/modules/dataset/model'),
  {UserGroup: UserGroupModel, UserGroupRoleOptions} = require('./src/modules/group/model'),
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

const isMemberOf = async (connection, user, groupId) => {
  const userGroup = await connection.getRepository(UserGroupModel).findOne({
    userId: user.id,
    groupId
  });
  let isMember = false;
  if (userGroup) {
    isMember = [UserGroupRoleOptions.MEMBER,
      UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR].includes(userGroup.role);
  }
  return isMember;
};

const saveDS = async (connection, dsId, submitterId, groupId, approved, principalInvestigator) => {
    const dsUpdate = {
      id: dsId,
      userId: submitterId,
      groupId: groupId,
      groupApproved: approved,
      piName: principalInvestigator ? principalInvestigator.name : undefined,
      piEmail: principalInvestigator ? principalInvestigator.email : undefined
    };
    await connection.getRepository(DatasetModel).save(dsUpdate);
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
    create: async (_, args, {user, connection}) => {
      const {input, priority} = args;
      let {id: dsId} = args;
      if (dsId)
        await assertCanEditDataset(connection, user, dsId);
      else
        assertCanCreateDataset(user);

      input.metadata = JSON.parse(input.metadataJson);
      validateMetadata(input.metadata);
      await molDBsExist(input.molDBs);

      const url = dsId ? `/v1/datasets/${dsId}/add` : '/v1/datasets/add';
      const resp = await smAPIRequest(url, {
        doc: input,
        priority: priority,
        email: user.email,
      });
      // TODO: generate dsId here and save it before calling SM API
      dsId = resp['ds_id'];

      const {submitterId, groupId, principalInvestigator} = input;

      let groupApproved = false;
      if (groupId)
        groupApproved = await isMemberOf(connection, user, groupId);

      await saveDS(connection, dsId, submitterId, groupId,
        groupApproved, principalInvestigator);
      return JSON.stringify({ dsId, status: 'success' });
    },

    update: async (_, args, {user, connection}) => {
      const {id: dsId, input: update, reprocess, delFirst, force, priority} = args;
      await assertCanEditDataset(connection, user, dsId);

      if (update.metadataJson) {
        update.metadata = JSON.parse(update.metadataJson);
        validateMetadata(update.metadata);
      }

      const engineDS = await fetchEngineDS({id: dsId});
      const {newDB, procSettingsUpd} = await processingSettingsChanged(engineDS, update);
      const reprocessingNeeded = newDB || procSettingsUpd;

      const {submitterId, groupId, principalInvestigator} = update;

      let groupApproved = false;
      if (groupId)
        groupApproved = await isMemberOf(connection, user, groupId);

      if (reprocess) {
        await saveDS(connection, dsId, submitterId, groupId,
          groupApproved, principalInvestigator);
        return await smAPIRequest(`/v1/datasets/${dsId}/add`, {
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
          await saveDS(connection, dsId, submitterId, groupId,
            groupApproved, principalInvestigator);
          const resp = await smAPIRequest(`/v1/datasets/${dsId}/update`, {
            doc: update,
            priority: priority,
            force: force,
          });
          return JSON.stringify(resp);
        }
      }
    },

    delete: async (_, args, {user, connection}) => {
      const {id: dsId, priority} = args;
      await assertCanEditDataset(connection, user, dsId);

      try {
        await smAPIRequest(`/v1/datasets/${dsId}/del-optical-image`, {});
      }
      catch (err) {
        logger.warn(err);
      }

      await connection.getRepository(DatasetModel).delete(dsId);
      const resp = await smAPIRequest(`/v1/datasets/${dsId}/delete`, {});
      return JSON.stringify(resp);
    },

    addOpticalImage: async (_, {input}, {user, connection}) => {
      const {datasetId: dsId, transform} = input;
      let {imageUrl} = input;
      await assertCanEditDataset(connection, user, dsId);

        // TODO support image storage running on a separate host
      const url = `http://localhost:${config.img_storage_port}${imageUrl}`;
      const resp = await smAPIRequest(`/v1/datasets/${dsId}/add-optical-image`, {
        url, transform
      });
      return JSON.stringify(resp);
    },

    deleteOpticalImage: async (_, args, {user, connection}) => {
      const {datasetId: dsId} = args;
      await assertCanEditDataset(connection, user, dsId);
      const resp = await smAPIRequest(`/v1/datasets/${dsId}/del-optical-image`, {});
      return JSON.stringify(resp);
    }
  }
};
