const jsondiffpatch = require('jsondiffpatch'),
  config = require('config'),
  Ajv = require('ajv'),
  fetch = require('node-fetch'),
  {UserError} = require('graphql-errors'),
  _ = require('lodash');

const {logger, fetchEngineDS, fetchMolecularDatabases} = require('./utils.js'),
  metadataSchemaIMS = require('./src/assets/ims.json'),
  metadataSchemaLCMS = require('./src/assets/lcms.json'),
  {Dataset: DatasetModel} = require('./src/modules/user/model'),
  {UserGroup: UserGrouModel, UserGroupRoleOptions} = require('./src/modules/group/model');

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
  const metadataType = metadata.Data_Type;
  let validator = {};
  let metadataSchema = {};
  if (metadataType === 'Imaging MS') {
    metadataSchema = metadataSchemaIMS;
    validator = ajv.compile(metadataSchemaIMS);
  } else if (metadataType === 'LC-MS') {
    metadataSchema = metadataSchemaIMS;
    validator = ajv.compile(metadataSchemaLCMS);
  }
  const cleanValue = trimEmptyFields(metadataSchema, metadata);
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

async function smAPIRequest(datasetId, uri, body) {
  const url = `http://${config.services.sm_engine_api_host}${uri}`;
  let rawResp = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const resp = await rawResp.json();
  if (!rawResp.ok) {
    if (resp.status === 'dataset_busy')
      throw new UserError(JSON.stringify({
        'type': 'dataset_busy',
        'hint': `Dataset is busy. Try again later.`
      }));
    else
      throw new UserError(`smAPIRequest: ${JSON.stringify(resp)}`);
  }
  else {
    logger.info(`Successful ${uri}: ${datasetId}`);
    logger.debug(`Body: ${JSON.stringify(body)}`);
    return resp;
  }
}

const hasEditAccess = async (connection, user, dsId) => {
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
    throw new UserError(`DS id not privided`);
  }
};

const isMemberOf = async (connection, user, groupId) => {
  const userGroup = await connection.getRepository(UserGrouModel).find({
    userId: user.id,
    groupId
  });
  if (![UserGroupRoleOptions.MEMBER,
    UserGroupRoleOptions.PRINCIPAL_INVESTIGATOR].includes(userGroup.role))
    throw new UserError(`User ${user.id} is not a member of ${groupId} group`);
};

const saveDS = async (connection, dsId, input) => {
  if (input.submitterId || input.groupId) {
    const dsUpdate = {
      id: dsId,
      userId: input.submitterId,
      groupId: input.groupId
    };
    await connection.getRepository(DatasetModel).save(dsUpdate);
  }
};

const smAPIdsUpdate = (update) => {
  const smapiFieldMap = {
    name: 'name',
    inputPath: 'input_path',
    uploadDT: 'upload_dt',
    metadata: 'metadata',
    isPublic: 'is_public',
    submitterId: 'submitter_id',
    groupId: 'group_id',
    adducts: 'adducts',
    moldDBs: 'mol_dbs'
  };
  let smAPIUpdate = _.pickBy(update, (v,k) => Object.keys(smapiFieldMap).includes(k));
  smAPIUpdate = _.mapKeys(smAPIUpdate, (v,k) => smapiFieldMap[k]);
  return smAPIUpdate;
};

module.exports = {
  processingSettingsChanged,

  Mutation: {
    create: async (args, {user, connection}) => {
      const {input, priority} = args;
      let dsId = args.id;
      if (!user)
        throw new UserError(`Not authenticated`);

      if (input.groupId)
        await isMemberOf(connection, user, groupId);

      try {
        input.metadata = JSON.parse(input.metadataJson);
        validateMetadata(input.metadata);
        await molDBsExist(input.molDBs);

        const body = {
          input: smAPIdsUpdate(input),
          priority: priority,
          email: user.email,
        };
        if (dsId)
          body.input.id = dsId;

        // TODO: generate dsId here and save it before calling SM API
        const resp = await smAPIRequest(dsId, '/v1/datasets/add', body);
        dsId = resp['ds_id'];

        await saveDS(connection, dsId, input);
        return JSON.stringify({ dsId });
      } catch (e) {
        logger.error(e.stack);
        throw e;
      }
    },

    update: async (args, {user, connection}) => {
      const {id: dsId, input: update, reprocess, delFirst, force, priority} = args;
      try {
        await hasEditAccess(connection, user, dsId);
        if (update.groupId)
          await isMemberOf(connection, user, update.groupId);

        if (update.metadataJson !== undefined) {
          update.metadata = JSON.parse(update.metadataJson);
          validateMetadata(update.metadata);
        }

        const engineDS = await fetchEngineDS({id: dsId});
        const {newDB, procSettingsUpd} = await processingSettingsChanged(engineDS, update);
        const reprocessingNeeded = newDB || procSettingsUpd;

        //TODO: handle principalInvestigator update

        const body = {
          id: dsId,
          update: smAPIdsUpdate(update),
          priority: priority,
          force: force,
        };

        if (reprocess) {
          body.del_first = procSettingsUpd || delFirst;  // delete old results if processing settings changed
          return await smAPIRequest(dsId, '/v1/datasets/add', body);
        }
        else {
          if (reprocessingNeeded) {
            throw new UserError(JSON.stringify({
              'type': 'reprocessing_needed',
              'hint': `Reprocessing needed. Provide 'reprocess' flag.`
            }));
          }
          else {
            await saveDS(connection, dsId, update);
            const resp = await smAPIRequest(dsId, `/v1/datasets/${dsId}/update`, body);
            return JSON.stringify(resp);
          }
        }
      } catch (e) {
        logger.error(e.stack);
        throw e;
      }
    },

    delete: async (args, {user, connection}) => {
      const {id: dsId, priority} = args;

      try {
        await hasEditAccess(connection, user, dsId);

        try {
          await smAPIRequest(id, `/v1/datasets/${id}/del-optical-image`, {});
        }
        catch (err) {
          logger.warn(err);
        }

        return await smAPIRequest(id, `/v1/datasets/${id}/delete`, {});
      } catch (e) {
        logger.error(e.stack);
        throw e;
      }
    },

    addOpticalImage: async (args, {user, connection}) => {
      const {datasetId: dsId, imageUrl, transform} = args;
      await hasEditAccess(connection, user, dsId);

      const basePath = `http://localhost:${config.img_storage_port}`;
      if (imageUrl[0] === '/') {
        // imageUrl comes from the web application and should not include host/port.
        //
        // This is necessary for a Virtualbox installation because of port mapping,
        // and preferred for AWS installation because we're not charged for downloads
        // if internal network is used.
        //
        // TODO support image storage running on a separate host
        imageUrl = basePath + imageUrl;
      }
      try {
        const uri = `/v1/datasets/${dsId}/add-optical-image`;
        const body = {url: imageUrl, transform};
        return await smAPIRequest(dsId, uri, body);
      } catch (e) {
        logger.error(e.message);
        throw e;
      }
    },

    deleteOpticalImage: async (args, {user, connection}) => {
      const {datasetId: dsId} = args;
      await hasEditAccess(connection, user, dsId);
      return await smAPIRequest(dsId, `/v1/datasets/${dsId}/del-optical-image`, {});
    }
  }
};
