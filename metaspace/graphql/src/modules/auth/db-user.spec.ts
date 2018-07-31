import config from '../../utils/config';
import {createExpiry} from "./utils";
import {knex, initSchema} from './db';
import {createUser,
  verifyEmail,
  resetPassword,
  sendResetPasswordToken,
  verifyPassword} from "./db-user";

jest.mock('./email');
import * as _mockEmail from './email';
const mockEmail = _mockEmail as jest.Mocked<typeof _mockEmail>;

const knexAdmin = require('knex')({
  client: 'postgres',
  connection: {
    host     : 'localhost',
    user     : 'sm',
    password : 'password',
    database : 'postgres'
  },
  searchPath: ['graphql']
});

describe('Database operations with user', () => {

  beforeAll(async () => {
    console.log('> beforeAll');
    console.log(config.db);
    await knexAdmin.raw(`DROP DATABASE ${config.db.database}`);
    await knexAdmin.raw(`CREATE DATABASE ${config.db.database}`);
    await initSchema();
  });

  afterAll(async () => {
    console.log('> afterAll');
    await knex.destroy();
    await knexAdmin.raw(`DROP DATABASE ${config.db.database}`);
    await knexAdmin.destroy();
  });

  beforeEach(async () => {
  });

  afterEach(async () => {
    await knex.from('user').truncate();
  });

  test('create absolutely new user', async () => {
    await createUser({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    const user = await knex('user').select(['name', 'email', 'role', 'emailVerified']).first();
    expect(user).toMatchObject({
      name: 'Name',
      email: 'admin@localhost',
      emailVerified: false
    });
    const sendEmailCallArgs = mockEmail.sendVerificationEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('create user when it already exists', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      emailVerificationToken: 'abc',
      emailVerificationTokenExpires: createExpiry(1)
    });
    const fields = ['email', 'hash', 'name', 'emailVerificationToken'];
    const oldUser = await knex('user').select(fields).first();

    await createUser({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    let newUser = await knex('user').select(fields).first();
    expect(newUser).toMatchObject(oldUser);

    const sendEmailCallArgs = mockEmail.sendVerificationEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('create user when it already exists but email verification token expired', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      emailVerificationToken: 'abc',
      emailVerificationTokenExpires: createExpiry(-1)
    });
    const oldUser = await knex('user').select(['email', 'hash', 'name']).first();
    const oldUserVerificationToken = (await knex('user')
      .select(['emailVerificationToken']).first()).emailVerificationToken;

    await createUser({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    let newUser = await knex('user').select(['email', 'hash', 'name']).first();
    expect(newUser).toMatchObject(oldUser);
    const newUserEmailVerificationToken = (await knex('user')
      .select(['emailVerificationToken']).first()).emailVerificationToken;
    expect(oldUserVerificationToken).not.toEqual(newUserEmailVerificationToken);

    const sendEmailCallArgs = mockEmail.sendVerificationEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('create user when it already exists, email verified', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      emailVerificationToken: null,
      emailVerified: true
    });
    const fields = ['email', 'hash', 'name', 'emailVerified', 'emailVerificationToken'];
    const oldUser = await knex('user').select(fields).first();

    await createUser({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    let newUser = await knex('user').select(fields).first();
    expect(newUser).toMatchObject(oldUser);

    const sendEmailCallArgs = mockEmail.sendLoginEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('verify email', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      emailVerificationToken: 'abc',
      emailVerificationTokenExpires: createExpiry(1),
      emailVerified: false
    });

    await verifyEmail('admin@localhost', 'abc');

    const fields = ['emailVerified', 'emailVerificationToken'];
    let user = await knex('user').select(fields).first();
    expect(user).toMatchObject({
      emailVerified: true,
      emailVerificationToken: null
    });
  });

  test('verify email fails, token expired', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      emailVerificationToken: 'abc',
      emailVerificationTokenExpires: createExpiry(-1),
      emailVerified: false
    });

    const user = await verifyEmail('admin@localhost', 'abc');

    expect(user).toBeUndefined();
  });

  test('send reset password token', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      resetPasswordToken: null
    });

    await sendResetPasswordToken('admin@localhost');

    const fields = ['resetPasswordToken'];
    let user = await knex('user').select(fields).first();
    expect(user.resetPasswordToken).not.toBeNull();

    const sendEmailCallArgs = mockEmail.sendResetPasswordEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('send reset password token, token refreshed', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      resetPasswordToken: 'abc',
      resetPasswordTokenExpires: createExpiry(-1)
    });
    let oldUser = await knex('user').select(['resetPasswordToken']).first();

    await sendResetPasswordToken('admin@localhost');

    let newUser = await knex('user').select(['resetPasswordToken']).first();
    expect(newUser.resetPasswordToken).not.toEqual(oldUser.resetPasswordToken);

    const sendEmailCallArgs = mockEmail.sendResetPasswordEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('reset password', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      resetPasswordToken: 'abc',
      resetPasswordTokenExpires: createExpiry(1)
    });

    await resetPassword('admin@localhost', 'new password', 'abc');

    let user = await knex('user').select(['hash']).first();
    expect(await verifyPassword('new password', user.hash)).toBeTruthy();
  });

  test('reset password fails, token expired', async () => {
    await knex('user').insert({
      name: 'Name',
      email: 'admin@localhost',
      resetPasswordToken: 'abc',
      resetPasswordTokenExpires: createExpiry(-1)
    });

    const user = await resetPassword('admin@localhost', 'new password', 'abc');

    expect(user).toBeUndefined();
  });
});
