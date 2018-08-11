import config from '../../utils/config';
import {DbSchemaName} from './utils';

import * as Knex from 'knex';

export let knex: Knex;

const dbConfig = () => {
  const {host, database, user, password} = config.db;
  return {
    host, database, user, password,
    max: 10, // client pool size
    idleTimeoutMillis: 30000
  };
};

const createConnection = () => {
  knex = Knex({
    client: 'pg',
    connection: dbConfig(),
    searchPath: [DbSchemaName],
    pool: {
      min: 1,
      max: 1
    },
    // debug: true
  });
};

export const initSchema = async (): Promise<any> => {
  createConnection();

  await knex.raw(`CREATE SCHEMA IF NOT EXISTS ${DbSchemaName}`);

  if (!await knex.schema.hasTable('user')) {
    await knex.schema.createTable(
      'user',
      function (t) {
        t.increments('id').primary();
        t.string('email');
        t.string('hash');
        t.string('name');
        t.string('role');
        t.string('googleId');
        t.string('emailVerificationToken');
        t.timestamp('emailVerificationTokenExpires');
        t.string('resetPasswordToken');
        t.timestamp('resetPasswordTokenExpires');
        t.boolean('emailVerified');
      });
  }
};

export interface DbRow {
  id: number;
}

export const updateTable = async (name: string, row: DbRow): Promise<void> => {
  await knex(name).where('id', row.id).update(row);
};