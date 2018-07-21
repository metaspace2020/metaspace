import {knex,
  initSchema,
  takeFirst} from './db';
import {verifyPassword} from './db-user'

import config from '../../utils/config';
import {createUser, verifyEmail, resetPassword, createResetPasswordToken} from "./db-user";

// const knexAdmin = require('knex')({
//   client: 'postgres',
//   connection: {
//     host     : 'localhost',
//     user     : 'sm',
//     password : 'password',
//     database : 'postgres'
//   },
//   searchPath: ['graphql']
// });

describe('Database operations with user', () => {

  beforeAll(async () => {
    console.log('> beforeAll');
    console.log(config.db);
    // await knexAdmin.raw(`DROP DATABASE ${config.db.database}`);
    // await knexAdmin.raw(`CREATE DATABASE ${config.db.database}`);
    await initSchema();
    // await knexAdmin.destroy();
  });

  afterAll(async () => {
    console.log('> afterAll');
    // await knexAdmin.raw(`DROP DATABASE ${config.db.database}`);
    // await knexAdmin.destroy();
    // await require('./db').knex.destroy();
  });

  beforeEach(async () => {
    // jest.resetAllMocks();
    // suppressConsoleWarn('async-validator:');
  });

  afterEach(async () => {
    await knex('user').delete();
  });

  test('create absolutely new user', async () => {
    await createUser({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    const users = await knex('user').select(['name', 'email', 'role', 'emailVerified']);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: 'Name',
      email: 'admin@localhost',
      emailVerified: false
    });
  });

  test('create user when it already exists', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      emailVerificationToken: 'abc'
    });
    const oldUser = takeFirst(await knex('user').select(['email', 'hash', 'name']));
    const oldUserVerificationToken = takeFirst(await knex('user')
      .select(['email', 'hash', 'name'])).emailVerificationToken;

    await createUser({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    let newUser = takeFirst(await knex('user').select(['email', 'hash', 'name']));
    expect(newUser).toMatchObject(oldUser);
    const newUserEmailVerificationToken = takeFirst(await knex('user')
      .select(['emailVerificationToken'])).emailVerificationToken;
    expect(oldUserVerificationToken).not.toEqual(newUserEmailVerificationToken);
  });

  test('create user when it already exists, email verified', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      emailVerificationToken: null,
      emailVerified: true
    });
    const fields = ['email', 'hash', 'name', 'emailVerified', 'emailVerificationToken'];
    const oldUser = takeFirst(await knex('user').select(fields));

    await createUser({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    let newUser = takeFirst(await knex('user').select(fields));
    expect(newUser).toMatchObject(oldUser);
  });

  test('verify email', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      emailVerificationToken: 'abc',
      emailVerified: false
    });

    const u = await verifyEmail('admin@localhost', 'abc');
    console.log(u);

    const fields = ['emailVerified', 'emailVerificationToken'];
    let user = takeFirst(await knex('user').select(fields));
    expect(user).toMatchObject({
      emailVerified: true,
      emailVerificationToken: null
    });
  });

  test('create reset password token', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      resetPasswordToken: null
    });

    await createResetPasswordToken('admin@localhost');

    const fields = ['resetPasswordToken'];
    let user = takeFirst(await knex('user').select(fields));
    expect(user.resetPasswordToken).not.toBeNull();
  });

  test('reset password', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      resetPasswordToken: 'abc'
    });

    await resetPassword('admin@localhost', 'new password', 'abc');

    let user = takeFirst(await knex('user').select(['hash']));
    expect(await verifyPassword('new password', user.hash)).toBeTruthy();
  });

});
