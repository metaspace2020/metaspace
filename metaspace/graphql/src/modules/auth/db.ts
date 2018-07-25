import {defaults} from 'lodash';
import config from '../../utils/config';

import * as Knex from 'knex';

const dbConfig = () => {
  const {host, database, user, password} = config.db;
  return {
    host, database, user, password,
    max: 10, // client pool size
    idleTimeoutMillis: 30000
  };
};

export const knex = Knex({
  client: 'pg',
  connection: dbConfig(),
  searchPath: [config.db.schema],
  pool: {
    min: 1,
    max: 1
  },
  // debug: true
});

export const initSchema = async (): Promise<any> => {
  await knex.raw(`CREATE SCHEMA IF NOT EXISTS ${config.db.schema}`);

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
        t.boolean('emailVerified').defaultTo(false);
      });
  }
};

export const takeFirst = (objs: any[]): any => {
  return objs.length == 0 ? undefined : objs[0];
};

export interface DbRow {
  id: number;
}

export const updateTable = async (name: string, row: DbRow): Promise<void> => {
  await knex(name).where('id', '=', row.id).update(row);
};