import * as Knex from 'knex';
import config from './config';
import * as _ from 'lodash';

const defaultDBConfig = {
  ...config.db,
  max: 10, // client pool size
  idleTimeoutMillis: 30000
}

export const createConnection = (dbConfig: object={}, schemaName: string='public'): Knex => {
  return Knex({
    client: 'postgres',
    connection: _.merge(defaultDBConfig, dbConfig),
    searchPath: [schemaName],
    // pool: {
    //   min: 1,
    //   max: 1
    // },
    // debug: true
  });
};

export interface DbRow {
  id: number;
}

export const createUpdateTable = (knex: Knex) => {
  return async (name: string, row: DbRow): Promise<void> => {
    await knex(name).where('id', row.id).update(row);
  };
}