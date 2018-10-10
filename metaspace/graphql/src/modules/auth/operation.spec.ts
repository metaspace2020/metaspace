import {DeepPartial} from 'typeorm';
import {createExpiry} from "./operation";
import {
  createUserCredentials,
  resetPassword, sendResetPasswordToken,
  verifyPassword, verifyEmail,
  findUserById
} from './operation'
import {Credentials} from './model';
import {User} from '../user/model';

jest.mock('./email');
import * as _mockEmail from './email';
import {Moment} from 'moment';
import {
  onAfterAll, onAfterEach,
  onBeforeAll, onBeforeEachWithOptions, testEntityManager,
} from '../../tests/graphqlTestEnvironment';
const mockEmail = _mockEmail as jest.Mocked<typeof _mockEmail>;

async function createUserCredentialsEntities(user?: Object, cred?: Object):
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
  await testEntityManager.insert(Credentials, updCred);

  const defaultUser = {
    name: 'Name',
  };
  const updUser = {
    ...defaultUser,
    ...user,
    credentials: updCred
  };
  await testEntityManager.insert(User, updUser as User);

  return {
    user: updUser,
    cred: updCred
  };
}

describe('Database operations with user', () => {
  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(onBeforeEachWithOptions({
    suppressTestDataCreation: true
  }));
  afterEach(onAfterEach);

  test('create new user credentials', async () => {
    await createUserCredentials({
      email: 'admin@localhost',
      name: 'Name',
      password: 'password',
    });

    const cred = await testEntityManager.findOneOrFail(Credentials);
    expect(cred.id).toEqual(expect.anything());
    expect(cred.hash).toEqual(expect.anything());
    expect(cred.emailVerified).toEqual(false);

    const user = await testEntityManager.findOneOrFail(User, { relations: ['credentials'] });
    expect(user.id).toEqual(expect.anything());
    expect(user.notVerifiedEmail).toEqual('admin@localhost');
    expect(user.name).toEqual('Name');

    expect(mockEmail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith('admin@localhost', expect.anything());
  });

  test('create credentials when user already exists', async () => {
    let {user, cred} = await createUserCredentialsEntities(
      { email: 'admin@localhost' });

    await createUserCredentials({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost',
    });

    let newCred = (await testEntityManager.findOne(Credentials)) as Credentials;
    expect(newCred).toMatchObject(cred);

    expect(mockEmail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith('admin@localhost', expect.anything());
  });

  test('create credentials when user already exists but email verification token expired', async () => {
    let {user: oldUser, cred: oldCred} = await createUserCredentialsEntities(
      { notVerifiedEmail: 'admin@localhost' },
      { emailVerified: false, emailVerificationTokenExpires: createExpiry(-1) });

    await createUserCredentials({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    const newCred = (await testEntityManager.findOne(Credentials)) as Credentials;
    expect(newCred.hash).toEqual(oldCred.hash);
    expect(newCred.emailVerificationToken).not.toEqual(oldCred.emailVerificationToken);
    expect(newCred.emailVerificationTokenExpires).toEqual(expect.anything());
    expect(newCred.emailVerificationTokenExpires!.valueOf())
      .toBeGreaterThan((oldCred.emailVerificationTokenExpires as Moment).valueOf());

    expect(mockEmail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith('admin@localhost', expect.anything());
  });

  test('create user when it already exists, email verified', async () => {
    let {user, cred} = await createUserCredentialsEntities({}, {emailVerified: true});

    await createUserCredentials({
      name: 'Name',
      password: 'password',
      email: 'admin@localhost'
    });

    const updCred = await testEntityManager.findOne(Credentials);
    expect(updCred).toMatchObject(cred);

    expect(mockEmail.sendLoginEmail).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendLoginEmail).toHaveBeenCalledWith('admin@localhost');
  });

  test('verify email', async () => {
    let {user, cred} = await createUserCredentialsEntities({ notVerifiedEmail: 'admin@localhost' });

    const verifiedUser = await verifyEmail('admin@localhost', 'abc');

    const updUser = (await findUserById(verifiedUser!.id)) as User;
    expect(updUser.credentials).toMatchObject({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpires: null
    });

    expect(verifiedUser!.email).toMatch('admin@localhost');
    expect(verifiedUser!.notVerifiedEmail).toBeNull();

    const savedUser = (await testEntityManager.findOne(User, {
      relations: ['credentials', 'groups']
    })) as User;
    expect(savedUser).toMatchObject(updUser);
  });

  test('verify email fails, token expired', async () => {
    let {user, cred} = await createUserCredentialsEntities(
      { notVerifiedEmail: 'admin@localhost' },
      { emailVerificationTokenExpires: createExpiry(-1) });

    const updUser = await verifyEmail('admin@localhost', 'abc');

    expect(updUser).toBeNull();
  });

  test('send reset password token', async () => {
    await createUserCredentialsEntities({ email: 'admin@localhost' });

    await sendResetPasswordToken('admin@localhost');

    const updCred = (await testEntityManager.findOne(Credentials)) as Credentials;
    expect(updCred.resetPasswordToken).not.toBeNull();
    expect(updCred.resetPasswordTokenExpires).not.toBeNull();

    expect(mockEmail.sendResetPasswordEmail).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendResetPasswordEmail).toHaveBeenCalledWith('admin@localhost', expect.anything());
  });

  test('send reset password token, token refreshed', async () => {
    const {user, cred} = await createUserCredentialsEntities(
      { email: 'admin@localhost' },
      { resetPasswordTokenExpires: createExpiry(-1) });

    await sendResetPasswordToken('admin@localhost');

    let updCred = (await testEntityManager.findOne(Credentials)) as Credentials;
    expect(updCred.resetPasswordToken).not.toEqual(cred.resetPasswordToken);

    expect(mockEmail.sendResetPasswordEmail).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendResetPasswordEmail).toHaveBeenCalledWith('admin@localhost', expect.anything());
  });

  test('reset password', async () => {
    const {user, cred} = await createUserCredentialsEntities(
      { email: 'admin@localhost' }, {
        resetPasswordToken: 'abc',
        resetPasswordTokenExpires: createExpiry(1)
      });

    await resetPassword('admin@localhost', 'new password', 'abc');

    let updCred = (await testEntityManager.findOne(Credentials)) as Credentials;
    expect(await verifyPassword('new password', updCred.hash)).toBeTruthy();
  });

  test('reset password fails, token expired', async () => {
    const {user, cred} = await createUserCredentialsEntities(
      {}, {
        resetPasswordToken: 'abc',
        resetPasswordTokenExpires: createExpiry(-1)
      });

    const updUser = await resetPassword('admin@localhost', 'new password', 'abc');

    expect(updUser).toBeUndefined();
  });
});
