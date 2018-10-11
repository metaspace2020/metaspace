require('ts-node/register');
const Knex = require('knex');
const config = require('../utils/config').default;
const {createConnection, DbSchemaName} = require('../utils/db');

module.exports = async () => {

  if (config.db.database === 'sm'
    || config.util.getConfigSources().some(({name}) => name.endsWith('development.js') || name.endsWith('production.js'))) {
    // Prevent accidentally dropping peoples' development DBs
    throw new Error('ERROR: Running with a development/production database config. Try running again with NODE_ENV=test')
  }

  const knexAdmin = Knex({
    client: 'postgres',
    connection: {
      host     : config.db.host,
      user     : 'postgres',
      password : 'postgres',
      database : 'postgres'
    },
    debug: false
  });
  await knexAdmin.raw(`DROP DATABASE IF EXISTS ${config.db.database};`);
  await knexAdmin.raw(`CREATE DATABASE ${config.db.database} OWNER ${config.db.user}`);
  await knexAdmin.destroy();

  const knex = Knex({
    client: 'postgres',
    connection: {
      host: config.db.host,
      database: config.db.database,
      user: 'postgres',
      password : 'postgres'
    },
    searchPath: ['public', DbSchemaName],
    debug: false
  });
  await knex.raw(`
      CREATE SCHEMA ${DbSchemaName} AUTHORIZATION ${config.db.user};
      CREATE EXTENSION "uuid-ossp";
      CREATE TABLE public.dataset (
        id	        	text,
        upload_dt			timestamp,
        metadata			json,
        is_public     boolean not null default(true),
        CONSTRAINT dataset_id_pk PRIMARY KEY(id)
      );
      GRANT ALL ON ALL TABLES IN SCHEMA public TO ${config.db.user}`);
  await knex.destroy();

  // Create a TypeORM connection just to apply migrations, so that parallel tests don't conflict during initialization
  await (await createConnection()).close();
};
