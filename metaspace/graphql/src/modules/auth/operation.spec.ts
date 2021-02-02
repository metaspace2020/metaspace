import {
  createExpiry, validateResetPasswordToken,
  createUserCredentials,
  resetPassword, sendResetPasswordToken,
  verifyPassword, verifyEmail,
  findUserById,
} from './operation'

import { Credentials } from './model'
import { User } from '../user/model'

jest.mock('./email')
import * as _mockEmail from './email'
import { Moment } from 'moment'
import {
  onAfterAll, onAfterEach,
  onBeforeAll, onBeforeEach, testEntityManager,
} from '../../tests/graphqlTestEnvironment'
const mockEmail = _mockEmail as jest.Mocked<typeof _mockEmail>

async function createUserCredentialsEntities(user?: Partial<User>, cred?: Partial<Credentials>):
  Promise<{ user: User, cred: Credentials }> {
  const defaultCred = {
    hash: 'some hash',
    emailVerificationToken: 'abc',
    emailVerificationTokenExpires: createExpiry(10),
    resetPasswordToken: null,
    emailVerified: false,
  }
  const updCred = {
    ...defaultCred,
    ...cred,
  }
  await testEntityManager.insert(Credentials, updCred)

  const defaultUser = {
    name: 'Name',
  }
  const updUser = {
    ...defaultUser,
    ...user,
    credentials: updCred,
  }
  await testEntityManager.insert(User, updUser as User)

  return {
    user: updUser as User,
    cred: updCred as Credentials,
  }
}

describe('Database operations with user', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(onBeforeEach)
  afterEach(onAfterEach)

  describe('createUserCredentials', () => {
    test('create new user credentials', async() => {
      await createUserCredentials({
        email: 'admin@localhost',
        name: 'Name',
        password: 'password',
      })

      const cred = await testEntityManager.findOneOrFail(Credentials, {
        select: ['id', 'hash', 'emailVerified'],
      })
      expect(cred.id).toEqual(expect.anything())
      expect(cred.hash).toEqual(expect.anything())
      expect(cred.emailVerified).toEqual(false)

      const user = await testEntityManager.findOneOrFail(User, { relations: ['credentials'] })
      expect(user.id).toEqual(expect.anything())
      expect(user.notVerifiedEmail).toEqual('admin@localhost')
      expect(user.name).toEqual('Name')

      expect(mockEmail.sendVerificationEmail).toHaveBeenCalledTimes(1)
      expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith('admin@localhost', expect.anything())
    })

    test('create credentials when user already exists', async() => {
      const { cred } = await createUserCredentialsEntities(
        { notVerifiedEmail: 'admin@localhost' })

      await createUserCredentials({
        name: 'Name',
        password: 'password',
        email: 'admin@localhost',
      })

      const newCred = (await testEntityManager.findOne(Credentials)) as Credentials
      expect(newCred).toMatchObject({
        ...cred,
        hash: expect.anything(),
      })

      expect(mockEmail.sendVerificationEmail).toHaveBeenCalledTimes(1)
      expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith('admin@localhost', expect.anything())
    })

    test('create credentials when user already exists but email verification token expired', async() => {
      const { cred: oldCred } = await createUserCredentialsEntities(
        { notVerifiedEmail: 'admin@localhost' },
        { emailVerified: false, emailVerificationTokenExpires: createExpiry(-1) })

      await createUserCredentials({
        name: 'Name',
        password: 'password',
        email: 'admin@localhost',
      })

      const newCred = (await testEntityManager.findOne(Credentials)) as Credentials
      expect(newCred.hash).not.toEqual(oldCred.hash)
      expect(newCred.emailVerificationToken).not.toEqual(oldCred.emailVerificationToken)
      expect(newCred.emailVerificationTokenExpires).toEqual(expect.anything())
      expect(newCred.emailVerificationTokenExpires!.valueOf())
        .toBeGreaterThan((oldCred.emailVerificationTokenExpires as Moment).valueOf())

      expect(mockEmail.sendVerificationEmail).toHaveBeenCalledTimes(1)
      expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith('admin@localhost', expect.anything())
    })

    test('create user when it already exists, email verified', async() => {
      const { cred } = await createUserCredentialsEntities({ email: 'admin@localhost' }, { emailVerified: true })

      await createUserCredentials({
        name: 'Name',
        password: 'password',
        email: 'admin@localhost',
      })

      const updCred = await testEntityManager.findOne(Credentials)
      expect(updCred).toMatchObject({
        ...cred,
        hash: expect.anything(),
      })

      expect(mockEmail.sendLoginEmail).toHaveBeenCalledTimes(1)
      expect(mockEmail.sendLoginEmail).toHaveBeenCalledWith('admin@localhost', expect.anything())
    })
  })

  describe('verifyEmail', () => {
    test('verify email', async() => {
      await createUserCredentialsEntities({ notVerifiedEmail: 'admin@localhost' })

      const verifiedUser = await verifyEmail('admin@localhost', 'abc')

      const updUser = (await findUserById(verifiedUser!.id)) as User
      expect(updUser.credentials).toMatchObject({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpires: null,
      })

      expect(verifiedUser!.email).toMatch('admin@localhost')
      expect(verifiedUser!.notVerifiedEmail).toBeNull()

      const savedUser = (await testEntityManager.findOne(User, {
        relations: ['credentials', 'groups'],
      })) as User
      expect(savedUser).toMatchObject(updUser)
    })

    test('verify email fails, token expired', async() => {
      await createUserCredentialsEntities(
        { notVerifiedEmail: 'admin@localhost' },
        { emailVerificationTokenExpires: createExpiry(-1) })

      const updUser = await verifyEmail('admin@localhost', 'abc')

      expect(updUser).toBeNull()
    })
  })

  describe('sendResetPasswordToken', () => {
    test('send reset password token', async() => {
      await createUserCredentialsEntities({ email: 'admin@localhost' })

      await sendResetPasswordToken('admin@localhost')

      const updCred = (await testEntityManager.findOne(Credentials)) as Credentials
      expect(updCred.resetPasswordToken).not.toBeNull()
      expect(updCred.resetPasswordTokenExpires).not.toBeNull()

      expect(mockEmail.sendResetPasswordEmail).toHaveBeenCalledTimes(1)
      expect(mockEmail.sendResetPasswordEmail).toHaveBeenCalledWith('admin@localhost', expect.anything())
    })

    test('send reset password token, token refreshed', async() => {
      const { cred } = await createUserCredentialsEntities(
        { email: 'admin@localhost' },
        { resetPasswordTokenExpires: createExpiry(-1) })

      await sendResetPasswordToken('admin@localhost')

      const updCred = (await testEntityManager.findOne(Credentials)) as Credentials
      expect(updCred.resetPasswordToken).not.toEqual(cred.resetPasswordToken)

      expect(mockEmail.sendResetPasswordEmail).toHaveBeenCalledTimes(1)
      expect(mockEmail.sendResetPasswordEmail).toHaveBeenCalledWith('admin@localhost', expect.anything())
    })

    test('send reset password token, inactive user', async() => {
      await createUserCredentialsEntities({ notVerifiedEmail: 'inactive@user' })

      await sendResetPasswordToken('inactive@user')

      expect(mockEmail.sendResetPasswordEmail).toHaveBeenCalledTimes(1)
      expect(mockEmail.sendResetPasswordEmail).toHaveBeenCalledWith('inactive@user', expect.anything())
    })

    test('send reset password token, user doesn\'t exist', async() => {
      await sendResetPasswordToken('i@dont.exist')

      expect(mockEmail.sendCreateAccountEmail).toHaveBeenCalledTimes(1)
      expect(mockEmail.sendCreateAccountEmail).toHaveBeenCalledWith('i@dont.exist', expect.anything())
    })
  })

  describe('validateResetPasswordToken', () => {
    const email = 'admin@localhost'
    const token = 'abc'
    const testCases = [
      { testCase: 'valid token', expiry: 1, tokenToTry: token, expected: true },
      { testCase: 'invalid token', expiry: 1, tokenToTry: 'def', expected: false },
      { testCase: 'expired token', expiry: -1, tokenToTry: token, expected: false },
    ]

    testCases.forEach(({ testCase, tokenToTry, expiry, expected }) => {
      test(testCase, async() => {
        await createUserCredentialsEntities(
          { email }, {
            resetPasswordToken: token,
            resetPasswordTokenExpires: createExpiry(expiry),
          })

        const result = await validateResetPasswordToken(email, tokenToTry)

        expect(result).toBe(expected)
      })
    })
  })

  describe('sendResetPasswordToken', () => {
    test('reset password', async() => {
      const { cred } = await createUserCredentialsEntities(
        { email: 'admin@localhost' }, {
          resetPasswordToken: 'abc',
          resetPasswordTokenExpires: createExpiry(1),
        })

      await resetPassword('admin@localhost', 'new password', 'abc')

      const updCred = (await testEntityManager.findOne(Credentials, cred.id)) as Credentials
      expect(await verifyPassword('new password', updCred.hash)).toBeTruthy()
    })

    test('reset password fails, token expired', async() => {
      await createUserCredentialsEntities(
        {}, {
          resetPasswordToken: 'abc',
          resetPasswordTokenExpires: createExpiry(-1),
        })

      const updUser = await resetPassword('admin@localhost', 'new password', 'abc')

      expect(updUser).toBeUndefined()
    })

    test('reset password, inactive user', async() => {
      const { user } = await createUserCredentialsEntities({
        notVerifiedEmail: 'inactive@user',
        name: 'inactive user',
      }, {
        emailVerified: false,
        resetPasswordToken: 'abc',
        resetPasswordTokenExpires: createExpiry(1),
      })

      await resetPassword('inactive@user', 'new password', 'abc')

      const updUser = await testEntityManager.findOneOrFail(User, user.id, { relations: ['credentials'] })
      expect(await verifyPassword('new password', updUser.credentials.hash)).toBeTruthy()
      expect(updUser).toMatchObject({
        email: 'inactive@user',
        notVerifiedEmail: null,
        credentials: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationTokenExpires: null,
        },
      })
    })
  })
})
