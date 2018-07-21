import {knex, initSchema, takeFirst} from './db';

import config from '../../utils/config';
import {DbUser, createUser, verifyEmail, resetPassword, createResetPasswordToken} from "./db-user";

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
    await knex('user').truncate();
  });

  test('create absolutely new user', async () => {
    await createUser({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    const users = await knex('user').select(['name', 'email', 'password', 'role', 'emailVerified']);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost',
      emailVerified: false
    });
  });

  test('create user when it already exists', async () => {
    await knex('user').insert({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost',
      emailVerificationToken: 'abc'
    });
    const oldUser = takeFirst(await knex('user').select(['email', 'password', 'name', 'emailVerificationToken']));

    await createUser({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    let newUser = takeFirst(await knex('user').select(['email', 'password', 'name']));
    expect(newUser).toMatchObject({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });
    newUser = takeFirst(await knex('user').select(['emailVerificationToken']));
    expect(oldUser.emailVerificationToken).not.toEqual(newUser.emailVerificationToken);
  });

  test('create user when it already exists, email verified', async () => {
    await knex('user').insert({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost',
      emailVerificationToken: null,
      emailVerified: true
    });
    const fields = ['email', 'password', 'name', 'emailVerified', 'emailVerificationToken'];
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
      password: 'password',
      email: 'admin@localhost',
      emailVerificationToken: 'abc',
      emailVerified: false
    });

    await verifyEmail('admin@localhost', 'abc');

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
      password: 'password',
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
      password: 'password',
      email: 'admin@localhost',
      resetPasswordToken: 'abc'
    });

    await resetPassword('admin@localhost', 'new password', 'abc');

    const fields = ['password', 'resetPasswordToken'];
    let user = takeFirst(await knex('user').select(fields));
    expect(user.password).toBe('new password');
    expect(user.resetPasswordToken).toBeNull();
  });

});
