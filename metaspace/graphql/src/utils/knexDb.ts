import config from './config';
import * as Knex from 'knex';
import {UserError} from 'graphql-errors';

const defaultDBConfig = () => {
  const {host, database, user, password} = config.db;
  return {
    host, database, user, password,
    max: 10, // client pool size
    idleTimeoutMillis: 30000
  };
};

/** @deprecated Use TypeORM instead */
export let db: Knex; // Don't initialize immediately as tests may need to set up the DB first.

export const initDBConnection = (config = defaultDBConfig) => {
  db = Knex({
    client: 'pg',
    connection: config(),
    searchPath: ['engine', 'public'],
    // @ts-ignore
    asyncStackTraces: true,
  });
  return db;
};

type IdOrName = {id?: string, name?: string};
/** @deprecated Use TypeORM instead */
export const fetchEngineDS = async ({id, name}: IdOrName) => {
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
};
