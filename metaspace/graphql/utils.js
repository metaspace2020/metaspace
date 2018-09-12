const slack = require('node-slack'),
  jsondiffpatch = require('jsondiffpatch'),
  winston = require('winston'),
  moment = require('moment'),
  { PubSub } = require('graphql-subscriptions'),
  {UserError} = require('graphql-errors'),
  fetch = require('node-fetch'),
  Knex = require('knex');

const config = require('config');

function metadataChangeSlackNotify(user, datasetId, oldMetadata, newMetadata) {
  const delta = jsondiffpatch.diff(oldMetadata, newMetadata),
    diff = jsondiffpatch.formatters.jsonpatch.format(delta);

  const slackConn = config.slack.webhook_url ? new slack(config.slack.webhook_url): null;
  if (slackConn) {
    let msg = slackConn.send({
      text: `${user} edited metadata of dataset (id: ${datasetId})` +
      "\nDifferences:\n" + JSON.stringify(diff, null, 2),
      channel: config.slack.channel
    });
  }
}

function metadataUpdateFailedSlackNotify(user, datasetId, e_msg) {
  const slackConn = config.slack.webhook_url ? new slack(config.slack.webhook_url): null;
  if (slackConn) {
    let msg = slackConn.send({
      text: `${user} tried to edit metadata (ds_id=${datasetId})\nError: ${e_msg}`,
      channel: config.slack.channel
    });
  }
}

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      level: config.log.level,
      timestamp: function() {
        return moment().format();
      },
      // formatter: function(options) {
      //   // TODO Lachlan: This custom formatter logs an empty string when given an error
      //   // Copy the default formatter's behavior for when options.message is empty
      //   // Return string will be passed to logger.
      //   return options.timestamp() +' - '+ options.level.toUpperCase() +' - '+ (options.message ? options.message : '') +
      //     (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
      // }
    })
  ]
});

const pubsub = new PubSub();

const defaultDBConfig = () => {
  const {host, database, user, password} = config.db;
  return {
    host, database, user, password,
    max: 10, // client pool size
    idleTimeoutMillis: 30000
  };
};

let db; // Don't initialize immediately as tests may need to set up the DB first.

const initDBConnection = (config = defaultDBConfig) => {
  db = Knex({
    client: 'pg',
    connection: config(),
    searchPath: ['engine', 'public']
  });
  return db;
};

function canUserViewEsDataset(dataset, user) {
  return dataset._source.ds_is_public
    || (user != null && user.role === 'admin')
    || (user != null && user.email != null && user.email !== '' && dataset._source.ds_submitter_email === user.email);
}

function canUserViewPgDataset(dataset, user) {
  return dataset.is_public
    || (user != null && user.role === 'admin')
    || (user != null && user.email != null && user.email !== ''
      && dataset.metadata.Submitted_By.Submitter.Email === user.email);
}


function pgDatasetsViewableByUser(user) {
  // The returned callback can be used in `.from` and `.join` clauses, e.g. `.from(pgDatasetsViewableByUser(user))`
  // This pattern is used to protect against accidentally breaking the filters by using a chained `.orWhere` clause
  // More discussion here: https://github.com/tgriesser/knex/issues/1714
  return q => {
    let filter;
    if (user && user.role === 'admin') {
      filter = ds => true;
    } else if (user && user.email) {
      filter = ds => ds.where('is_public', true)
                       .orWhereRaw("metadata#>>'{Submitted_By,Submitter,Email}' = ?", [user.email]);
    } else {
      filter = ds => ds.where('is_public', true);
    }
    return q.from('dataset').where(filter).as('dataset');
  };
}

async function assertUserCanViewDataset(datasetId, user) {
  const records = await db.select().from('dataset').where('id', '=', datasetId);

  if (records.length === 0)
    throw new UserError(`No dataset with specified id: ${datasetId}`);

  if (!canUserViewPgDataset(records[0], user)) {
    throw new UserError(`You don't have permissions to view the dataset: ${datasetId}`);
  }
}

async function fetchEngineDS({id, name}) {
  let records;
  if (id !== undefined)
    records = await db.select().from('dataset').where('id', '=', id);
  else if (name !== undefined)
    records = await db.select().from('dataset').where('name', '=', name);
  else
    throw new UserError(`'id' or 'name' must be provided`);

  if (records.length === 0)
    throw new UserError(`DS '${id}' does not exist`);
  else if (records.length > 1)
    throw new UserError(`More than one dataset found: '${id}' '${name}'`);

  const ds = records[0];
  return {
    id: ds.id,
    name: ds.name,
    inputPath: ds.input_path,
    uploadDT: ds.upload_dt,
    metadata: ds.metadata,
    metadataJson: JSON.stringify(ds.metadata),
    config: ds.config,
    isPublic: ds.is_public,
    molDBs: ds.mol_dbs,
    adducts: ds.adducts
  };
}

const deprecatedMolDBs = new Set(['HMDB', 'ChEBI', 'LIPID_MAPS', 'SwissLipids', 'COTTON_HMDB']);

async function fetchMolecularDatabases() {
  const host = config.services.moldb_service_host,
    resp = await fetch(`http://${host}/v1/databases`),
    body = await resp.json();
  return body['data'];
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export {
  addProcessingConfig,
  metadataChangeSlackNotify,
  metadataUpdateFailedSlackNotify,
  canUserViewEsDataset,
  canUserViewPgDataset,
  pgDatasetsViewableByUser,
  assertUserCanViewDataset,
  fetchEngineDS,
  fetchMolecularDatabases,
  deprecatedMolDBs,
  wait,
  config,
  logger,
  pubsub,
  db,
  initDBConnection,
};
