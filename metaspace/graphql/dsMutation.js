const jsondiffpatch = require('jsondiffpatch'),
  config = require('config'),
  Ajv = require('ajv'),
  fetch = require('node-fetch'),
  {UserError} = require('graphql-errors'),
  _ = require('lodash');

const {db, logger, fetchDS, assertUserCanEditDataset,
    addProcessingConfig, fetchMolecularDatabases} = require('./utils.js'),
  metadataSchema = require('./metadata_schema.json');

let {molecularDatabases} = 1;

ajv = new Ajv({allErrors: true});
validator = ajv.compile(metadataSchema);

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

function setSubmitter(oldMetadata, newMetadata, user) {
  const email = oldMetadata != null
    ? oldMetadata.Submitted_By.Submitter.Email
    : user.email;
  _.set(newMetadata, ['Submitted_By', 'Submitter', 'Email'], email)
}

function validateMetadata(metadata) {
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

function processingSettingsChanged(ds, updDS) {
  const configDelta = jsondiffpatch.diff(ds.config, updDS.config),
    configDiff = jsondiffpatch.formatters.jsonpatch.format(configDelta),
    metaDelta = jsondiffpatch.diff(ds.metadata, updDS.metadata),
    metaDiff = jsondiffpatch.formatters.jsonpatch.format(metaDelta);

  let newDB = false, procSettingsUpd = false;
  for (let diffObj of configDiff) {
    if (diffObj.op !== 'move') {  // ignore permuations in arrays
      if (diffObj.path.startsWith('/databases') && diffObj.op == 'add')
        newDB = true;
      if (!diffObj.path.startsWith('/databases'))
        procSettingsUpd = true;
    }
  }
  return {newDB: newDB, procSettingsUpd: procSettingsUpd,
    configDiff: configDiff, metaDiff: metaDiff}
}

async function smAPIRequest(datasetId, uri, body) {
  const url = `http://${config.services.sm_engine_api_host}${uri}`;
  let resp = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const respText = await resp.text();
  if (!resp.ok) {
    const err = JSON.parse(respText);
    if (err.status == 'dataset_busy')
      throw new UserError(JSON.stringify({
        'type': 'dataset_busy',
        'hint': `Dataset is busy. Try again later.`
      }));
    else
      throw new UserError(`smAPIRequest: ${respText}`);
  }
  else {
    logger.info(`Successful ${uri}: ${datasetId}`);
    logger.debug(`Body: ${JSON.stringify(body)}`);
    return respText;
  }
}

function updateObject(obj, upd) {
  const updObj = _.cloneDeep(obj);
  _.extend(updObj, upd);
  return updObj;
}

module.exports = {
  Mutation: {
    create: async (args, user) => {
      const {id, input, priority} = args;
      try {
        if (id !== undefined && user.role == 'admin') {
          let ds = await fetchDS({id});
          if (ds !== undefined)
            throw new UserError(`DS id '${id}' already exists`);
        }

        input.metadata = JSON.parse(input.metadataJson);
        setSubmitter(null, input.metadata, user);
        validateMetadata(input.metadata);
        await molDBsExist(input.molDBs);
        addProcessingConfig(input);

        const body = {
          name: input.name,
          input_path: input.inputPath,
          upload_dt: input.uploadDT,
          metadata: input.metadata,
          config: input.config,
          is_public: input.isPublic,
          mol_dbs: input.molDBs,
          adducts: input.adducts,
          priority: priority,
          email: user.email,
        };
        if (id !== undefined)
          body.id = id;
        return await smAPIRequest(id, '/v1/datasets/add', body);
      } catch (e) {
        logger.error(e.stack);
        throw e;
      }
    },
    update: async (args, user) => {
      const {id, input, reprocess, delFirst, force, priority} = args;
      try {
        let ds = await fetchDS({id});
        if (ds === undefined) {
          throw new UserError(`DS id '${id}' does not exist`);
        }
        await assertUserCanEditDataset(id, user);

        if (input.metadataJson !== undefined)
          input.metadata = JSON.parse(input.metadataJson);
        const updDS = updateObject(ds, input);

        setSubmitter(ds.metadata, updDS.metadata, user);
        validateMetadata(updDS.metadata);
        addProcessingConfig(updDS);

        const {newDB, procSettingsUpd} = await processingSettingsChanged(ds, updDS);
        const reprocessingNeeded = newDB || procSettingsUpd;

        const body = {
          id: updDS.id,
          name: updDS.name,
          input_path: updDS.inputPath,
          upload_dt: updDS.uploadDT,
          metadata: updDS.metadata,
          config: updDS.config,
          is_public: updDS.isPublic,
          mol_dbs: updDS.molDBs,
          adducts: updDS.adducts,
          del_first: procSettingsUpd || delFirst,  // delete old results if processing settings changed
          priority: priority,
          force: force
        };

        if (reprocess) {
          return await smAPIRequest(updDS.id, '/v1/datasets/add', body);
        }
        else {
          if (reprocessingNeeded) {
            throw new UserError(JSON.stringify({
              'type': 'reprocessing_needed',
              'hint': `Reprocessing needed. Provide 'reprocess' flag.`
            }));
          }
          else {
            return await smAPIRequest(updDS.id, `/v1/datasets/${updDS.id}/update`, body);
          }
        }
      } catch (e) {
        logger.error(e.stack);
        throw e;
      }
    },
    delete: async (args, user) => {
      const {id, priority} = args;

      try {
        await assertUserCanEditDataset(id, user);

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
    addOpticalImage: async (args, user) => {
      let {datasetId, imageUrl, transform} = args;
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
        logger.info(args);
        await assertUserCanEditDataset(datasetId, user);
        const uri = `/v1/datasets/${datasetId}/add-optical-image`;
        const body = {url: imageUrl, transform};
        return await smAPIRequest(datasetId, uri, body);
      } catch (e) {
        logger.error(e.message);
        throw e;
      }
    },
    deleteOpticalImage: async (args, user) => {
      const {datasetId} = args;
      await assertUserCanEditDataset(datasetId, user);
      return await smAPIRequest(datasetId, `/v1/datasets/${datasetId}/del-optical-image`, {});
    }
  }
};
