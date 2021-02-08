import * as Knex from 'knex'
import config from '../utils/config'
import { createConnection } from '../utils/db'
import { DbSchemaName } from '../utils/typeOrmConfig'

export = async() => {
  if (config.db.database === 'sm'
    || config.util.getConfigSources()
      .some(({ name }) => name.endsWith('development.js') || name.endsWith('production.js'))
  ) {
    // Prevent accidentally dropping peoples' development DBs
    throw new Error(
      'ERROR: Running with a development/production database config. Try running again with NODE_ENV=test'
    )
  }

  const knexAdmin = Knex({
    client: 'postgres',
    connection: { ...config.db, database: 'postgres' },
    debug: false,
  })
  await knexAdmin.raw(`DROP DATABASE IF EXISTS ${config.db.database};`)
  await knexAdmin.raw(`CREATE DATABASE ${config.db.database} OWNER ${config.db.user}`)
  await knexAdmin.destroy()

  const knex = Knex({
    client: 'postgres',
    connection: config.db,
    searchPath: ['public', DbSchemaName],
    debug: false,
  })
  await knex.raw(`
      CREATE SCHEMA ${DbSchemaName} AUTHORIZATION ${config.db.user};
      CREATE EXTENSION "uuid-ossp";
      GRANT ALL ON ALL TABLES IN SCHEMA public TO ${config.db.user}`)
  await knex.destroy()

  // For some reason the ts-jest transformer doesn't work automatically for the TypeORM migrations,
  // so manually register ts-node before running migrations.
  require('ts-node/register')
  // Create a TypeORM connection just to apply migrations, so that parallel tests don't conflict during initialization
  const conn = await createConnection()
  await conn.runMigrations()
  await conn.close()
};
