const jsondiffpatch = require('jsondiffpatch'),
  config = require('config'),
  Ajv = require('ajv'),
  fetch = require('node-fetch'),
  {UserError} = require('graphql-errors'),
  _ = require('lodash');

const {pg, logger, fetchDS, assertUserCanEditDataset,
    generateProcessingConfig, fetchMolecularDatabases} = require('./utils.js'),
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

async function reprocessingNeeded(oldMetadata, oldConfig, newMetadata, newConfig) {
  const configDelta = jsondiffpatch.diff(oldConfig, newConfig),
    configDiff = jsondiffpatch.formatters.jsonpatch.format(configDelta),
    metaDelta = jsondiffpatch.diff(oldMetadata, newMetadata),
    metaDiff = jsondiffpatch.formatters.jsonpatch.format(metaDelta);

  let dbUpd = false, procSettingsUpd = false;
  for (let diffObj of configDiff) {
    if (diffObj.op !== 'move') {
      if (diffObj.path.startsWith('/databases'))
        dbUpd = true;
      else
        procSettingsUpd = true;
    }
  }

  if (procSettingsUpd) {
    throw new UserError(JSON.stringify({
      'type': 'drop_submit_needed',
      'hint': `Resubmission needed. Call 'submitDataset' with 'delFirst: true'.`,
      'metadata_diff': metaDiff,
      'config_diff': configDiff
    }))
  }
  else if (dbUpd) {
    throw new UserError(JSON.stringify({
      'type': 'submit_needed',
      'hint': `Resubmission needed. Call 'submitDataset'.`,
      'metadata_diff': metaDiff,
      'config_diff': configDiff
    }))
  }
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
    throw new UserError(`smAPIRequest: ${respText}`);
  }
  else {
    logger.info(`Successful ${uri}: ${datasetId}`);
    logger.debug(`Body: ${JSON.stringify(body)}`);
    return respText;
  }
}

module.exports = {
  reprocessingNeeded,
  Query: {
    reprocessingNeeded: async (args, user) => {
      const {datasetId, metadataJson} = args,
        newMetadata = JSON.parse(metadataJson),
        newConfig = generateProcessingConfig(newMetadata),
        {metadata: oldMetadata, config: oldConfig} = await fetchDS({id: datasetId});
      await assertUserCanEditDataset(datasetId, user);
      try {
        await reprocessingNeeded(oldMetadata, oldConfig, newMetadata, newConfig);
        return false;
      }
      catch (e) {
        return true;
      }
    }
  },
  Mutation: {
    submit: async (args, user) => {
      const {datasetId, name, path, metadata, isPublic, priority, sync, delFirst} = args;
      try {
        if (datasetId !== undefined) {
          const ds = await fetchDS({id: datasetId});
          if (ds !== undefined)
            await assertUserCanEditDataset(datasetId, payload);
        }

        setSubmitter(null, metadata, user);
        validateMetadata(metadata);
        await molDBsExist(metadata.metaspace_options.Metabolite_Database);

        const body = {
          name: name,
          input_path: path,
          metadata: metadata,
          config: generateProcessingConfig(metadata),
          priority: priority,
          del_first: delFirst,
          is_public: isPublic
        };
        if (datasetId !== undefined)
          body.id = datasetId;
        return await smAPIRequest(datasetId, '/v1/datasets/add', body);
      } catch (e) {
        logger.error(e.stack);
        throw e;
      }
    },
    update: async (args, user) => {
      const {datasetId, name, metadataJson, isPublic, priority} = args;
      try {
        const newMetadata = JSON.parse(metadataJson);
        const ds = await fetchDS({id: datasetId});
        if (ds === undefined) {
          throw UserError('DS does not exist');
        }

        await assertUserCanEditDataset(ds.id, user);
        setSubmitter(ds.metadata, newMetadata, user);
        validateMetadata(newMetadata);
        const newConfig = generateProcessingConfig(newMetadata);
        await reprocessingNeeded(ds.metadata, ds.config, newMetadata, newConfig);

        const body = {
          metadata: newMetadata,
          config: newConfig,
          name: name || ds.name,
          priority: priority,
          is_public: isPublic
        };
        return await smAPIRequest(ds.id, `/v1/datasets/${ds.id}/update`, body);
      } catch (e) {
        logger.error(e.stack);
        throw e;
      }
    },
    delete: async (args, user) => {
      const {name, delRawData, sync} = args;

      try {
        let datasetId = args.datasetId;
        await assertUserCanEditDataset(datasetId, user);

        // if (delRawData != undefined || delRawData == false)
        //   body = JSON.stringify({});
        // else
        //   body = JSON.stringify({ "del_raw": true });
        try {
          await smAPIRequest(datasetId, `/v1/datasets/${datasetId}/del-optical-image`, {});
        }
        catch (err) {
          logger.warning(err);
        }

        return await smAPIRequest(datasetId, `/v1/datasets/${datasetId}/delete`, {});
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
