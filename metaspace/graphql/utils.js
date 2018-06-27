const slack = require('node-slack'),
  jsondiffpatch = require('jsondiffpatch'),
  winston = require('winston'),
  moment = require('moment'),
  { PubSub } = require('graphql-subscriptions'),
  {UserError} = require('graphql-errors'),
  fetch = require('node-fetch');

const config = require('config');


const RESOL_POWER_PARAMS = {
    '70K': {sigma: 0.00247585727028, fwhm: 0.00583019832869, pts_per_mz: 2019},
    '100K': {sigma: 0.0017331000892, fwhm: 0.00408113883008, pts_per_mz: 2885},
    '140K': {sigma: 0.00123792863514, fwhm: 0.00291509916435, pts_per_mz: 4039},
    '200K': {sigma: 0.000866550044598, fwhm: 0.00204056941504, pts_per_mz: 5770},
    '250K': {sigma: 0.000693240035678, fwhm: 0.00163245553203, pts_per_mz: 7212},
    '280K': {sigma: 0.00061896431757, fwhm: 0.00145754958217, pts_per_mz: 8078},
    '500K': {sigma: 0.000346620017839, fwhm: 0.000816227766017, pts_per_mz: 14425},
    '750K': {sigma: 0.000231080011893, fwhm: 0.000544151844011, pts_per_mz: 21637},
    '1000K': {sigma: 0.00017331000892, fwhm: 0.000408113883008, pts_per_mz: 28850},
};

// TODO: move config generation to engine
function addProcessingConfig(ds) {
  const polarity_dict = {'Positive': '+', 'Negative': '-'},
        polarity = polarity_dict[ds.metadata['MS_Analysis']['Polarity']],
        instrument = ds.metadata['MS_Analysis']['Analyzer'],
        rp = ds.metadata['MS_Analysis']['Detector_Resolving_Power'],
        rp_mz = parseFloat(rp['mz']),
        rp_resolution = parseFloat(rp['Resolving_Power']);

  let rp200, params;

  if (instrument === 'FTICR')
    rp200 = rp_resolution * rp_mz / 200.0;
  else if (instrument === 'Orbitrap')
    rp200 = rp_resolution * Math.pow(rp_mz / 200.0,  0.5);
  else
    rp200 = rp_resolution;

  if (rp200 < 85000)       params = RESOL_POWER_PARAMS['70K'];
  else if (rp200 < 120000) params = RESOL_POWER_PARAMS['100K'];
  else if (rp200 < 195000) params = RESOL_POWER_PARAMS['140K'];
  else if (rp200 < 265000) params = RESOL_POWER_PARAMS['250K'];
  else if (rp200 < 390000) params = RESOL_POWER_PARAMS['280K'];
  else if (rp200 < 625000) params = RESOL_POWER_PARAMS['500K'];
  else if (rp200 < 875000) params = RESOL_POWER_PARAMS['750K'];
  else params = RESOL_POWER_PARAMS['1000K'];

  const molDBs = ds.molDBs;
  for (let defaultMolDBName of config.defaults.moldb_names) {
    if (molDBs.indexOf(defaultMolDBName) < 0)
      molDBs.push(defaultMolDBName);
  }
  let adducts = config.defaults.adducts[polarity];
  if (Array.isArray(ds.adducts)) {
    if (ds.adducts.length > 0)
      adducts = ds.adducts;
  }

  ds.config = {
    "databases": molDBs,
    "isotope_generation": {
      "adducts": adducts,
      "charge": {
        "polarity": polarity,
        "n_charges": 1
      },
      "isocalc_sigma": Number(params['sigma'].toFixed(6)),
      "isocalc_pts_per_mz": params['pts_per_mz']
    },
    "image_generation": {
      "ppm": 3,
      "nlevels": 30,
      "q": 99,
      "do_preprocessing": false
    }
  };
}

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
      formatter: function(options) {
        // TODO Lachlan: This custom formatter logs an empty string when given an error
        // Copy the default formatter's behavior for when options.message is empty
        // Return string will be passed to logger.
        return options.timestamp() +' - '+ options.level.toUpperCase() +' - '+ (options.message ? options.message : '') +
          (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
      }
    })
  ]
});

const pubsub = new PubSub();

const dbConfig = () => {
  const {host, database, user, password} = config.db;
  return {
    host, database, user, password,
    max: 10, // client pool size
    idleTimeoutMillis: 30000
  };
};

let db = require('knex')({
  client: 'pg',
  connection: dbConfig(),
  searchPath: 'knex,public'
});

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

function assertUserCanEditDataset(datasetId, user) {
  return db.select().from('dataset').where('id', '=', datasetId)
    .then(records => {
      if (records.length === 0)
        throw new UserError(`No dataset with specified id: ${datasetId}`);

      if (user == null
          || !(user.role === 'admin'
               || user.email === records[0].metadata.Submitted_By.Submitter.Email)) {
        throw new UserError(`You don't have permissions to edit the dataset: ${datasetId}`);
      }
    });
}

async function fetchDS({id, name}) {
  // TODO Lachlan: Refactor this so that security is enforced by default
  let records;
  if (id !== undefined)
    records = await db.select().from('dataset').where('id', '=', id);
  else if (name !== undefined)
    records = await db.select().from('dataset').where('name', '=', name);
  else
    throw new UserError(`'id' or 'name' must be provided`);

  if (records.length === 0)
    return undefined;
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

async function fetchMolecularDatabases({hideDeprecated = true}) {
  const host = config.services.moldb_service_host,
    resp = await fetch(`http://${host}/v1/databases`),
    body = await resp.json();
  let molDBs = body['data'];
  if (hideDeprecated) {
    molDBs = molDBs.filter((molDB) => !deprecatedMolDBs.has(molDB.name));
  }
  return molDBs;
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  addProcessingConfig,
  metadataChangeSlackNotify,
  metadataUpdateFailedSlackNotify,
  canUserViewEsDataset,
  canUserViewPgDataset,
  pgDatasetsViewableByUser,
  assertUserCanViewDataset,
  assertUserCanEditDataset,
  fetchDS,
  fetchMolecularDatabases,
  wait,
  config,
  logger,
  pubsub,
  db
};
