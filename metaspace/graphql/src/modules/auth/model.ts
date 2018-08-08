import * as Knex from "knex"

import {DbRow} from '../../utils/db'

export interface DbUser extends DbRow {
  email: string;
  hash: string | null;
  name: string | null;
  role: string | null;
  googleId: string | null;
  emailVerificationToken: string | null;
  emailVerificationTokenExpires: Date | null;
  emailVerified: boolean | null;
  resetPasswordToken: string | null;
  resetPasswordTokenExpires: Date | null
}
export interface NewDbUser {
  email: string;
  password?: string;
  name?: string;
  googleId?: string;
}

const DbSchemaName = 'auth';

export const initSchema = async (knex: Knex): Promise<any> => {
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
