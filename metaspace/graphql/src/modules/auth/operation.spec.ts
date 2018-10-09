import * as uuid from 'uuid'
import * as Knex from 'knex'
import {Connection, DeepPartial, getRepository} from 'typeorm';

import config from '../../utils/config';
import {createExpiry} from "./operation";
import {createConnection, DbSchemaName} from '../../utils/db'
import {
  createUserCredentials,
  resetPassword, sendResetPasswordToken,
  verifyPassword, verifyEmail,
  initOperation,
  findUserById
} from './operation'
import {Credentials} from './model';
import {User} from '../user/model';

jest.mock('./email');
import * as _mockEmail from './email';
import {Moment} from 'moment';
const mockEmail = _mockEmail as jest.Mocked<typeof _mockEmail>;

async function createUserCredentialsEntities(connection: Connection, user?: Object, cred?: Object):
  Promise<{ user: DeepPartial<User>, cred: DeepPartial<Credentials> }> {
  const defaultCred = {
    hash: 'some hash',
    emailVerificationToken: 'abc',
    emailVerificationTokenExpires: createExpiry(10),
    resetPasswordToken: null,
    emailVerified: false
  };
  const updCred = {
    ...defaultCred,
    ...cred
  };
  await connection.manager.insert(Credentials, updCred);

  const defaultUser = {
    name: 'Name',
  };
  const updUser = {
    ...defaultUser,
    ...user,
    credentials: updCred
  };
  await connection.manager.insert(User, updUser as User);

  return {
    user: updUser,
    cred: updCred
  };
}

describe('Database operations with user', () => {
  let knexAdmin: Knex;
  let knex: Knex;
  let typeormConn: Connection;
  let id: string;

  beforeAll(async () => {
    console.log('> beforeAll');

    knexAdmin = Knex({
      client: 'postgres',
      connection: {
        host     : config.db.host,
        user     : 'postgres',
        database : 'postgres'
      },
      debug: false
    });
    await knexAdmin.raw(`DROP DATABASE IF EXISTS ${config.db.database};`);
    await knexAdmin.raw(`CREATE DATABASE ${config.db.database} OWNER ${config.db.user}`);

    knex = Knex({
      client: 'postgres',
      connection: {
        host: config.db.host,
        database: config.db.database,
        user: 'postgres'
      },
      searchPath: ['public', DbSchemaName],
      debug: false
    });
    await knex.raw(`
      CREATE SCHEMA ${DbSchemaName} AUTHORIZATION ${config.db.user};
      CREATE EXTENSION "uuid-ossp";`);

    typeormConn = await createConnection();
    await initOperation(typeormConn);
  });

  afterAll(async () => {
    console.log('> afterAll');

    await typeormConn.close();
    await knex.destroy();

    await knexAdmin.raw(`DROP DATABASE ${config.db.database}`);
    await knexAdmin.destroy();
  });

  beforeEach(async () => {
  });

  afterEach(async () => {
    await knex.raw('TRUNCATE TABLE "credentials" CASCADE');
  });

  test('create new user credentials', async () => {
    await createUserCredentials({
      email: 'admin@localhost',
      name: 'Name',
      password: 'password',
    });

    const cred = await typeormConn.manager.findOneOrFail(Credentials, {
      select: ['id', 'hash', 'emailVerified']
    });
    expect(cred.id).toEqual(expect.anything());
    expect(cred.hash).toEqual(expect.anything());
    expect(cred.emailVerified).toEqual(false);

    const user = await typeormConn.manager.findOneOrFail(User, { relations: ['credentials'] });
    expect(user.id).toEqual(expect.anything());
    expect(user.notVerifiedEmail).toEqual('admin@localhost');
    expect(user.name).toEqual('Name');

    const sendEmailCallArgs = mockEmail.sendVerificationEmail.mock.calls[0];
    expect(sendEmailCallArgs).toEqual(expect.anything());
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('create credentials when user already exists', async () => {
    let {user, cred} = await createUserCredentialsEntities(typeormConn,
      { email: 'admin@localhost' });

    await createUserCredentials({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost',
    });

    let newCred = (await typeormConn.manager.findOne(Credentials)) as Credentials;
    expect(newCred).toMatchObject(cred);

    const sendEmailCallArgs = mockEmail.sendVerificationEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('create credentials when user already exists but email verification token expired', async () => {
    let {user: oldUser, cred: oldCred} = await createUserCredentialsEntities(typeormConn,
      { notVerifiedEmail: 'admin@localhost' },
      { emailVerified: false, emailVerificationTokenExpires: createExpiry(-1) });

    await createUserCredentials({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    const newCred = (await typeormConn.manager.findOne(Credentials)) as Credentials;
    expect(newCred.hash).toEqual(oldCred.hash);
    expect(newCred.emailVerificationToken).not.toEqual(oldCred.emailVerificationToken);
    expect(newCred.emailVerificationTokenExpires).toEqual(expect.anything());
    expect(newCred.emailVerificationTokenExpires!.valueOf())
      .toBeGreaterThan((oldCred.emailVerificationTokenExpires as Moment).valueOf());

    const sendEmailCallArgs = mockEmail.sendVerificationEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('create user when it already exists, email verified', async () => {
    let {user, cred} = await createUserCredentialsEntities(
      typeormConn, {}, {emailVerified: true});

    await createUserCredentials({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    const updCred = await typeormConn.manager.findOne(Credentials);
    expect(updCred).toMatchObject(cred);

    const sendEmailCallArgs = mockEmail.sendLoginEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('verify email', async () => {
    let {user, cred} = await createUserCredentialsEntities(typeormConn,
      { notVerifiedEmail: 'admin@localhost' });

    const verifiedUser = await verifyEmail('admin@localhost', 'abc');

    const updUser = (await findUserById(verifiedUser!.id)) as User;
    expect(updUser.credentials).toMatchObject({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpires: null
    });

    expect(verifiedUser!.email).toMatch('admin@localhost');
    expect(verifiedUser!.notVerifiedEmail).toBeNull();

    const savedUser = (await typeormConn.manager.findOne(User, {
      relations: ['credentials', 'groups']
    })) as User;
    expect(savedUser).toMatchObject(updUser);
  });

  test('verify email fails, token expired', async () => {
    let {user, cred} = await createUserCredentialsEntities(typeormConn,
      { notVerifiedEmail: 'admin@localhost' },
      { emailVerificationTokenExpires: createExpiry(-1) });

    const updUser = await verifyEmail('admin@localhost', 'abc');

    expect(updUser).toBeNull();
  });

  test('send reset password token', async () => {
    await createUserCredentialsEntities(typeormConn,
      { email: 'admin@localhost' });

    await sendResetPasswordToken('admin@localhost');

    const updCred = (await typeormConn.manager.findOne(Credentials)) as Credentials;
    expect(updCred.resetPasswordToken).not.toBeNull();
    expect(updCred.resetPasswordTokenExpires).not.toBeNull();

    const sendEmailCallArgs = mockEmail.sendResetPasswordEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('send reset password token, token refreshed', async () => {
    const {user, cred} = await createUserCredentialsEntities(typeormConn,
      { email: 'admin@localhost' },
      { resetPasswordTokenExpires: createExpiry(-1) });

    await sendResetPasswordToken('admin@localhost');

    let updCred = (await typeormConn.manager.findOne(Credentials)) as Credentials;
    expect(updCred.resetPasswordToken).not.toEqual(cred.resetPasswordToken);

    const sendEmailCallArgs = mockEmail.sendResetPasswordEmail.mock.calls[0];
    expect(sendEmailCallArgs[0]).toBe('admin@localhost');
  });

  test('reset password', async () => {
    const {user, cred} = await createUserCredentialsEntities(typeormConn,
      { email: 'admin@localhost' }, {
        resetPasswordToken: 'abc',
        resetPasswordTokenExpires: createExpiry(1)
      });

    await resetPassword('admin@localhost', 'new password', 'abc');

    let updCred = (await typeormConn.manager.findOne(Credentials)) as Credentials;
    expect(await verifyPassword('new password', updCred.hash)).toBeTruthy();
  });

  test('reset password fails, token expired', async () => {
    const {user, cred} = await createUserCredentialsEntities(
      typeormConn, {}, {
        resetPasswordToken: 'abc',
        resetPasswordTokenExpires: createExpiry(-1)
      });

    const updUser = await resetPassword('admin@localhost', 'new password', 'abc');

    expect(updUser).toBeUndefined();
  });
});
