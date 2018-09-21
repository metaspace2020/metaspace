import * as bcrypt from 'bcrypt';
import * as uuid from 'uuid';
import {Connection, Repository} from 'typeorm';
import * as moment from 'moment';
import {Moment} from 'moment';

import * as emailService from './email';
import config from '../../utils/config';
import {logger, createConnection} from '../../utils';
import {Credentials} from './model';
import {User} from '../user/model';

export interface UserCredentialsInput {
  email: string;
  name: string;
  password?: string;
  googleId?: string;
}

const NUM_ROUNDS = 12;

let connection: Connection;
let credRepo: Repository<Credentials>;
let userRepo: Repository<User>;

export const initOperation = async (typeormConn?: Connection) => {
  connection = typeormConn || await createConnection();
  credRepo = connection.getRepository(Credentials);
  userRepo = connection.getRepository(User);
};

// FIXME: some mechanism should be added so that a user's other sessions are revoked when they change their password, etc.

export const findUserById = async (id: string, credentials: boolean=true,
                                   groups: boolean=true): Promise<User|undefined> => {
  if (id) {
    const relations = [];
    if (credentials)
      relations.push('credentials');
    if (groups)
      relations.push('groups');
    return await userRepo.findOne({
      relations: relations,
      where: { 'id': id }
    });
  }
};

export const findUserByEmail = async (email: string) => {
  return await userRepo.createQueryBuilder('user')
    .leftJoinAndSelect('user.credentials', 'credentials')
    .where('LOWER(email) = :email', {'email': email.toLowerCase()})
    .getOne();
};

export const findUserByGoogleId = async (googleId: string|undefined) => {
  return await userRepo.findOne({
    relations: ['credentials'],
    where: { 'googleId': googleId }
  });
};

export const createExpiry = (minutes: number=10): Moment => {
  return moment.utc().add(minutes, 'minutes');
};

const tokenExpired = (expires?: Moment|null): boolean => {
  return expires == null || expires < moment.utc();
};

const sendEmailVerificationToken = async (cred: Credentials, email: string) => {
  if (cred.emailVerificationToken == null || tokenExpired(cred.emailVerificationTokenExpires)) {
    cred.emailVerificationToken = uuid.v4();
    cred.emailVerificationTokenExpires = createExpiry();
    logger.debug(`Token is null or expired for ${cred.id}. New one generated: ${cred.emailVerificationToken}`);
    await credRepo.update({id: cred.id}, cred);
  }
  const link = `${config.web_public_url}/api_auth/verifyemail?email=${encodeURIComponent(email)}&token=${encodeURIComponent(cred.emailVerificationToken)}`;
  emailService.sendVerificationEmail(email, link);
  logger.debug(`Resent email verification to ${email}: ${link}`);
};

const createGoogleCredentials = async (userCred: UserCredentialsInput): Promise<Credentials> => {
  // TODO: Add a test case
  const newCred = credRepo.create({
    googleId: userCred.googleId || null,
  });
  await credRepo.insert(newCred);
  logger.info(`New google user added: ${userCred.email}`);
  return newCred;
};

const hashPassword = async (password: string|undefined): Promise<string|undefined> => {
  return (password) ? await bcrypt.hash(password, NUM_ROUNDS) : undefined;
};

export const verifyPassword = async (password: string, hash: string|null|undefined): Promise<boolean|undefined> => {
  return (hash) ? await bcrypt.compare(password, hash) : undefined;
};

const createLocalCredentials = async (userCred: UserCredentialsInput): Promise<Credentials> => {
  const cred = credRepo.create({
    hash: await hashPassword(userCred.password),
    googleId: userCred.googleId || undefined,
    emailVerificationToken: uuid.v4(),
    emailVerificationTokenExpires: createExpiry(),
    emailVerified: false
  });
  await credRepo.insert(cred);
  await sendEmailVerificationToken(cred, userCred.email);
  return cred;
};

export const createUserCredentials = async (userCred: UserCredentialsInput): Promise<void> => {
  const existingUser = await findUserByEmail(userCred.email);
  if (existingUser == null) {
    const newCred = userCred.googleId ?
      await createGoogleCredentials(userCred) :
      await createLocalCredentials(userCred);

    const newUser = userRepo.create({
      email: userCred.email,
      name: userCred.name,
      credentials: newCred
    });
    await userRepo.insert(newUser);
  }
  else if (!existingUser.credentials.emailVerified) {
    await sendEmailVerificationToken(existingUser.credentials, existingUser.email);
  } else {
    emailService.sendLoginEmail(existingUser.email);
    logger.debug(`Email already verified. Sent log in email to ${existingUser.email}`);
  }
};

export const verifyEmail = async (email: string, token: string): Promise<User|undefined> => {
  const user = await findUserByEmail(email);
  if (user) {
    if (user.credentials.emailVerificationToken !== token
      || tokenExpired(user.credentials.emailVerificationTokenExpires)) {
      logger.debug(`Token '${token}' is wrong or expired for ${email}`);
    }
    else {
      const updCred = credRepo.create({
        ...user.credentials,
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpires: null,
      });
      await credRepo.update(updCred.id, updCred);
      logger.info(`Verified user email ${email}`);
      return user;
    }
  }
  else {
    logger.warning(`User with ${email} does not exist`);
  }
};

export const sendResetPasswordToken = async (email: string): Promise<void> => {
  const user = await findUserByEmail(email);
  if (user == null) {
    throw new Error(`User with ${email} email does not exist`);
  }

  const cred = user.credentials;
  let resetPasswordToken;
  if (cred.resetPasswordToken == null || tokenExpired(cred.resetPasswordTokenExpires)) {
    resetPasswordToken = uuid.v4();
    logger.debug(`Token '${cred.resetPasswordToken}' expired for ${email}. A new one generated: ${resetPasswordToken}`);
    const updCred = credRepo.create({
      ...cred,
      resetPasswordToken,
      resetPasswordTokenExpires: createExpiry()
    });
    await credRepo.update(updCred.id, updCred);
  }
  else {
    resetPasswordToken = cred.resetPasswordToken;
  }
  const link = `${config.web_public_url}/account/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetPasswordToken)}`;
  emailService.sendResetPasswordEmail(email, link);
  logger.debug(`Sent password reset email to ${email}: ${link}`);
};

export const resetPassword = async (email: string, password: string, token: string): Promise<string | undefined> => {
  const user = await findUserByEmail(email);
  if (user) {
    if (user.credentials.resetPasswordToken !== token || tokenExpired(user.credentials.resetPasswordTokenExpires)) {
      logger.debug(`Token '${user.credentials.resetPasswordToken}' is wrong or expired for ${email}`);
    }
    else {
      const updCred = credRepo.create({
        ...user.credentials,
        hash: await hashPassword(password),
        resetPasswordToken: null,
        resetPasswordTokenExpires: null
      });
      await credRepo.update(updCred.id, updCred);
      logger.info(`Successful password reset: ${email}`);
      return user.id;
    }
  }
};
