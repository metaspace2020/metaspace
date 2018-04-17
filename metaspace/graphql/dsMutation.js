const jsondiffpatch = require('jsondiffpatch'),
  jwt = require('jwt-simple'),
  config = require('config'),
  Ajv = require('ajv'),
  fetch = require('node-fetch'),
  {UserError} = require('graphql-errors');

const {pg, logger, fetchDS, checkPermissions, generateProcessingConfig} = require('./utils.js'),
  metadataSchema = require('./metadata_schema.json');

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

async function reprocessingNeeded(datasetId, newMetadata, newConfig) {
  const records = await pg.select().from('dataset').where('id', '=', datasetId),
    oldMetadata = records[0].metadata,
    oldConfig = records[0].config,
    configDelta = jsondiffpatch.diff(oldConfig, newConfig),
    configDiff = jsondiffpatch.formatters.jsonpatch.format(configDelta),
    metaDelta = jsondiffpatch.diff(oldMetadata, newMetadata),
    metaDiff = jsondiffpatch.formatters.jsonpatch.format(metaDelta);

  let dbUpd = false, procSettingsUpd = false;
  for (let diffObj of configDiff) {
    if (diffObj.path.startsWith('/databases'))
      dbUpd = true;
    else
      procSettingsUpd = true;
  }

  if (procSettingsUpd) {
    throw new UserError(JSON.stringify({
      'type': 'drop_submit_needed',
      'hint': `Resubmission needed. Call 'submitDataset' with 'delFirst: true'.`,
      'metadata_diff': metaDiff
    }))
  }
  else if (dbUpd) {
    throw new UserError(JSON.stringify({
      'type': 'submit_needed',
      'hint': `Resubmission needed. Call 'submitDataset'.`,
      'metadata_diff': metaDiff
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
  if (resp.status !== 200) {
    throw new UserError(`smAPIRequest: ${respText}`);
  }
  else {
    logger.info(`Successful ${uri}: ${datasetId}`);
    logger.debug(`Body: ${JSON.stringify(body)}`);
    return respText;
  }
}

module.exports = {
  Query: {
    reprocessingNeeded: async (args) => {
      const {datasetId, metadataJson} = args,
        newMetadata = JSON.parse(metadataJson),
        newConfig = generateProcessingConfig(newMetadata);
      try {
        await reprocessingNeeded(datasetId, newMetadata, newConfig);
        return false;
      }
      catch (e) {
        return true;
      }
    }
  },
  Mutation: {
    submit: async (args) => {
      const {datasetId, name, path, metadata, priority, sync, delFirst} = args;
      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret);
        if (datasetId !== undefined)
          await checkPermissions(datasetId, payload);

        validateMetadata(metadata);

        const body = {
          name: name,
          input_path: path,
          metadata: metadata,
          config: generateProcessingConfig(metadata),
          priority: priority,
          del_first: delFirst
        };
        if (datasetId !== undefined)
          body.id = datasetId;
        let smAPIPromise = smAPIRequest(datasetId, '/v1/datasets/add', body);
        if (sync)
          return smAPIPromise;
        else
          return 'success';
      } catch (e) {
        logger.error(e.stack);
        throw e;
      }
    },
    update: async (args) => {
      const {datasetId, name, metadataJson, priority, sync} = args;
      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret),
          newMetadata = JSON.parse(metadataJson);
        const ds = await fetchDS({id: datasetId});
        if (ds === undefined) {
          throw UserError('DS does not exist');
        }

        await checkPermissions(ds.id, payload);
        validateMetadata(newMetadata);
        const newConfig = generateProcessingConfig(newMetadata);
        await reprocessingNeeded(ds.id, newMetadata, newConfig);

        const body = {
          metadata: newMetadata,
          config: newConfig,
          name: name || ds.name,
          priority: priority
        };
        let smAPIPromise = smAPIRequest(ds.id, `/v1/datasets/${ds.id}/update`, body);
        if (sync)
          return await smAPIPromise;
        else
          return 'success';
      } catch (e) {
        logger.error(e.stack);
        throw e;
      }
    },
    delete: async (args) => {
      const {name, delRawData, sync} = args;

      try {
        const payload = jwt.decode(args.jwt, config.jwt.secret);
        let datasetId = args.datasetId;
        await checkPermissions(datasetId, payload);

        // if (delRawData != undefined || delRawData == false)
        //   body = JSON.stringify({});
        // else
        //   body = JSON.stringify({ "del_raw": true });
        let smAPIPromise = smAPIRequest(datasetId, `/v1/datasets/${datasetId}/delete`, {});
        if (sync)
          return smAPIPromise;
        else
          return 'success';
      } catch (e) {
        logger.error(e.stack);
        throw e;
      }
    },
    addOpticalImage: async (_, {input}) => {
      let {datasetId, imageUrl, transform} = input;
      const basePath = `http://localhost:${config.img_storage_port}`;
      if (imageUrl[0] == '/') {
        // imageUrl comes from the web application and should not include host/port.
        //
        // This is necessary for a Virtualbox installation because of port mapping,
        // and preferred for AWS installation because we're not charged for downloads
        // if internal network is used.
        //
        // TODO support image storage running on a separate host
        imageUrl = basePath + imageUrl;
      }
      const payload = jwt.decode(input.jwt, config.jwt.secret);
      try {
        logger.info(input);
        await checkPermissions(datasetId, payload);
        const url = `http://${config.services.sm_engine_api_host}/v1/datasets/${datasetId}/add-optical-image`;
        const body = {url: imageUrl, transform};
        let processOptImage = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {'Content-Type': 'application/json'}});
        checkFetchRes(processOptImage);
        return 'success';
      } catch (e) {
        logger.error(e.message);
        return e.message;
      }
    },

    deleteOpticalImage: async (_, args) => {
      let {datasetId} = args;
      const payload = jwt.decode(args.jwt, config.jwt.secret);
      const url = `http://${config.services.sm_engine_api_host}/v1/datasets/${datasetId}/del-optical-image`;
      try {
        await checkPermissions(datasetId, payload);
        let dbDelFetch = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({datasetId}),
          headers: {'Content-Type': 'application/json'}});
        checkFetchRes(dbDelFetch);
        return 'success';
      } catch (e) {
        logger.error(e.message);
        return e.message;
      }
    }
  }
};