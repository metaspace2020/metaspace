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
  name?: string;
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

export const findUserById = async (id: string|undefined, credentials: boolean=true,
                                   groups: boolean=true): Promise<User|null> => {
  let user = null;
  if (id) {
    const relations = [];
    if (credentials)
      relations.push('credentials');
    if (groups)
      relations.push('groups');
    user = await userRepo.findOne({
      relations: relations,
      where: { 'id': id }
    }) || null;
  }
  return user;
};

export const findUserByEmail = async (value: string, field: string='email') => {
  return await userRepo.createQueryBuilder('user')
    .leftJoinAndSelect('user.credentials', 'credentials')
    .where(`LOWER(${field}) = :email`, {'email': value.toLowerCase()})
    .getOne() || null;
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

export const sendEmailVerificationToken = async (cred: Credentials, email: string) => {
  if (!cred.emailVerificationToken || tokenExpired(cred.emailVerificationTokenExpires)) {
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

export const verifyPassword = async (password: string, hash: string|null|undefined): Promise<boolean|null> => {
  return (hash) ? await bcrypt.compare(password, hash) : null;
};

const createLocalCredentials = async (userCred: UserCredentialsInput): Promise<Credentials> => {
  const cred = credRepo.create({
    hash: await hashPassword(userCred.password),
    googleId: userCred.googleId || null,
    emailVerificationToken: uuid.v4(),
    emailVerificationTokenExpires: createExpiry(),
    emailVerified: false
  });
  await credRepo.insert(cred);
  await sendEmailVerificationToken(cred, userCred.email);
  return cred;
};

export const createUserCredentials = async (userCred: UserCredentialsInput): Promise<void> => {
  const existingUser = await findUserByEmail(userCred.email, 'email');
  if (existingUser) {
    const link = `${config.web_public_url}//account/sign-in`;
    emailService.sendLoginEmail(existingUser.email!, link);
    logger.debug(`Email already verified. Sent log in email to ${existingUser.email}`);
  }
  else {
    const existingUserNotVerified = await findUserByEmail(userCred.email, 'not_verified_email');
    if (!existingUserNotVerified || !existingUserNotVerified.credentials) {
      const newCred = userCred.googleId ?
        await createGoogleCredentials(userCred) :
        await createLocalCredentials(userCred);

      const userUpd = {
        notVerifiedEmail: userCred.email,
        name: userCred.name,
        credentials: newCred
      };
      await userRepo.save({...existingUserNotVerified, ...userUpd});
    }
    else {
      await sendEmailVerificationToken(existingUserNotVerified.credentials,
        existingUserNotVerified.notVerifiedEmail!);
    }
  }
};

export const verifyEmail = async (email: string, token: string): Promise<User|null> => {
  let user = await findUserByEmail(email, 'not_verified_email');
  if (user) {
    if (user.credentials.emailVerificationToken !== token
      || tokenExpired(user.credentials.emailVerificationTokenExpires)) {
      logger.debug(`Token '${token}' is wrong or expired for ${email}`);
      user = null;
    }
    else {
      await credRepo.update(user.credentials.id, {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpires: null,
      });
      const userUpdate = {
        email: user.notVerifiedEmail,
        notVerifiedEmail: null
      };
      await userRepo.update(user.id, userUpdate);
      logger.info(`Verified user email ${email}`);
      user = {
        ...user,
        ...userUpdate,
      }
    }
  }
  else {
    user = await findUserByEmail(email, 'email');
    if (!user) {
      logger.warn(`User with ${email} does not exist`);
    }
  }
  return user;
};

export const sendResetPasswordToken = async (email: string): Promise<void> => {
  const user = await findUserByEmail(email);
  if (!user) {
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

export const resetPassword = async (email: string, password: string, token: string): Promise<User | undefined> => {
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
      return user;
    }
  }
};
