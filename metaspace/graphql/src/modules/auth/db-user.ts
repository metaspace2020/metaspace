import * as bcrypt from 'bcrypt';
import * as uuid from 'uuid';

import config from '../../utils/config';
import {createExpiry} from "./utils";
import {knex,
  takeFirst,
  DbRow,
  updateTable} from './db';
import * as emailService from './email';

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

const NUM_ROUNDS = 12;

const hashPassword = async (password: string|undefined): Promise<string|null> => {
  return (password) ? await bcrypt.hash(password, NUM_ROUNDS) : null;
};

export const verifyPassword = async (password: string, hash: string|null): Promise<boolean|undefined> => {
  return (hash) ? await bcrypt.compare(password, hash) : undefined;
};

// FIXME: some mechanism should be added so that a user's other sessions are revoked when they change their password, etc.

const tokenExpired = (expires: Date|null): boolean => {
  return expires == null || expires < new Date();
};

export const findUserById = async (id: number): Promise<Readonly<DbUser> | undefined> => {
  return takeFirst(await knex.select().from('user').where('id', '=', id));
};

export const findUserByEmail = async (email: string): Promise<Readonly<DbUser> | undefined> => {
  return takeFirst(await knex.select().from('user').where('email', '=', email));
};

export const findUserByGoogleId = async (googleId: string): Promise<Readonly<DbUser> | undefined> => {
  return takeFirst(await knex.select().from('user').where('googleId', '=', googleId));
};

const sendEmailVerificationToken = async (user: DbUser) => {
  if (user.emailVerificationToken == null || tokenExpired(user.emailVerificationTokenExpires)) {
    user.emailVerificationToken = uuid.v4();
    user.emailVerificationTokenExpires = createExpiry();
    console.log(`Token is null or expired for ${user.email}. New one generated: ${user.emailVerificationToken}`);
    await updateTable('user', user);
  }
  const link = `${config.web_public_url}/api_auth/verifyemail?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(user.emailVerificationToken)}`;
  emailService.sendVerificationEmail(user.email, link);
  console.log(`Resend email verification to ${user.email}: ${link}`);
};

export const createUser = async (userDetails: NewDbUser): Promise<Readonly<void>> => {
  const existingUser: DbUser = takeFirst(await knex.select().from('user').where('email', '=', userDetails.email));
  if (existingUser == null) {
    const emailVerificationToken = uuid.v4(),
      emailVerificationTokenExpires = createExpiry(),
      passwordHash = await hashPassword(userDetails.password);
    const newUser = {
      email: userDetails.email,
      hash: passwordHash,
      name: userDetails.name || null,
      googleId: userDetails.googleId || null,
      role: 'user',
      emailVerificationToken,
      emailVerificationTokenExpires,
      resetPasswordToken: null,
      emailVerified: false,
    };
    await knex('user').insert(newUser);
    const link = `${config.web_public_url}/api_auth/verifyemail?email=${encodeURIComponent(userDetails.email)}&token=${encodeURIComponent(emailVerificationToken)}`;
    emailService.sendVerificationEmail(userDetails.email, link);
    console.log(`Verification email sent to ${userDetails.email}: ${link}`);
  } else if (!existingUser.emailVerified) {
    await sendEmailVerificationToken(existingUser);
  } else {
    emailService.sendLoginEmail(existingUser.email);
    console.log(`Email already verified. Sent log in email to ${existingUser.email}`);
  }
};

export const verifyEmail = async (email: string, token: string): Promise<Readonly<DbUser> | undefined> => {
  const user: DbUser = takeFirst(await knex.select().from('user')
    .where('email', '=', email));
  if (user) {
    if (user.emailVerificationToken !== token || tokenExpired(user.emailVerificationTokenExpires)) {
      console.log(`Token is wrong or expired for ${email}`);
    }
    else {
      user.emailVerified = true;
      user.emailVerificationToken = null;
      user.emailVerificationTokenExpires = null;
      await updateTable('user', user);
      console.log(`Verified user email ${email}`);
      return user;
    }
  }
  else {
    console.log(`User with ${email} does not exist`);
  }
};

export const sendResetPasswordToken = async (email: string): Promise<void> => {
  const user: DbUser = takeFirst(await knex.select().from('user').where('email', '=', email));
  if (user == null) {
    throw new Error(`User with ${email} email does not exist`);
  }
  if (user.resetPasswordToken == null || tokenExpired(user.resetPasswordTokenExpires)) {
    console.error(`Token has already expired for ${email}. New one generated: ${user.resetPasswordToken}`);
    user.resetPasswordToken = uuid.v4();
    user.resetPasswordTokenExpires = createExpiry();
    await updateTable('user', user);
  }
  const link = `${config.web_public_url}/#/account/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(user.resetPasswordToken)}`;
  emailService.sendResetPasswordEmail(email, link);
  console.log(`Sent password reset email to ${email}: ${link}`);
};

export const resetPassword = async (email: string, password: string, token: string): Promise<Readonly<DbUser> | undefined> => {
  const user = takeFirst(await knex.select().from('user').where('email', '=', email));
  if (user) {
    if (user.resetPasswordToken !== token || tokenExpired(user.resetPasswordTokenExpires)) {
      console.log(`Token is wrong or expired for ${email}`);
    }
    else {
      user.hash = await hashPassword(password);
      user.resetPasswordToken = null;
      user.resetPasswordTokenExpires = null;
      await updateTable('user', user);
      console.log(`Successful password reset: ${email} '${token}'`);
      return user;
    }
  }
};
