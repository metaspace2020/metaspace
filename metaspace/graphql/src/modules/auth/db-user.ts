import * as bcrypt from 'bcrypt';

import config from '../../utils/config';
import {knex, takeFirst} from './db';

export interface DbUser {
  id: string;
  email: string;
  hash: string | null;
  name: string | null;
  role: string | null;
  googleId: string | null;
  emailVerificationToken: string | null;
  emailVerified: boolean | null;
  resetPasswordToken: string | null;
}
export interface NewDbUser {
  email: string;
  password?: string;
  name?: string;
  googleId?: string;
}

const NUM_ROUNDS = 8;

let hashPassword = async (password: string|undefined): Promise<string|null> => {
  return (password) ? await bcrypt.hash(password, NUM_ROUNDS) : null;
};

export let verifyPassword = async (password: string, hash: string|null): Promise<boolean|undefined> => {
  return (hash) ? await bcrypt.compare(password, hash) : undefined;
};

// FIXME: tokens need to be able to be expired, some mechanism should be added so that
// a user's other sessions are revoked when they change their password, etc.

export const findUserById = async (id: string): Promise<Readonly<DbUser> | undefined> => {
  return takeFirst(await knex.select().from('user').where('id', '=', id));
};

export const findUserByEmail = async (email: string): Promise<Readonly<DbUser> | undefined> => {
  return takeFirst(await knex.select().from('user').where('email', '=', email));
};

export const findUserByGoogleId = async (googleId: string): Promise<Readonly<DbUser> | undefined> => {
  return takeFirst(await knex.select().from('user').where('googleId', '=', googleId));
};

export const createUser = async (userDetails: NewDbUser): Promise<Readonly<void>> => {
  const existingUser: DbUser = takeFirst(await knex.select().from('user').where('email', '=', userDetails.email));

  if (existingUser == null) {
    const emailVerificationToken = new Date().valueOf().toString();
    const passwordHash = await hashPassword(userDetails.password);
    const newUser = {
      email: userDetails.email,
      hash: passwordHash,
      name: userDetails.name || null,
      googleId: userDetails.googleId || null,
      role: 'user',
      emailVerificationToken,
      resetPasswordToken: null,
      emailVerified: false,
    };
    await knex('user').insert(newUser);
    // TODO: Send email
    console.log(`Verification email sent: ${config.web_public_url}/api_auth/verifyemail?email=${encodeURIComponent(userDetails.email)}&token=${encodeURIComponent(emailVerificationToken)}`);
  } else if (!existingUser.emailVerified) {
    const emailVerificationToken = new Date().valueOf().toString();
    existingUser.emailVerificationToken = emailVerificationToken;
    // TODO: Only regenerate token if it has expired
    // TODO: Send email directing user to verify email
    console.log(`Resend email verification: ${config.web_public_url}/api_auth/verifyemail?email=${encodeURIComponent(userDetails.email)}&token=${encodeURIComponent(emailVerificationToken)}`);
    await knex('user').update(existingUser);
  } else {
    // TODO: Send email directing user to log in / reset password
    console.log(`Email already verified: ${existingUser.email}`);
  }
};

export const verifyEmail = async (email: string, token: string): Promise<Readonly<DbUser> | undefined> => {
  const user: DbUser = takeFirst(await knex.select().from('user')
    .where('email', '=', email).where('emailVerificationToken', '=', token));
  if (user) {
    user.emailVerified = true;
    user.emailVerificationToken = null;
    await knex('user').update(user);
  }
  else {
    throw new Error(`User with '${email}' '${token}' does not exist`);
  }
  return user;
};

export const createResetPasswordToken = async (email: string): Promise<string> => {
  const user: DbUser = takeFirst(await knex.select().from('user').where('email', '=', email));
  if (user == null) {
    throw new Error(`User with '${email}' email does not exist`);
  }
  user.resetPasswordToken = new Date().valueOf().toString();
  await knex('user').update(user);
  return user.resetPasswordToken;
};

export const resetPassword = async (email: string, password: string, token: string): Promise<Readonly<DbUser> | undefined> => {
  // TODO: token expiry, etc.
  const user: DbUser = takeFirst(await knex.select().from('user')
    .where('email', '=', email).where('resetPasswordToken', '=', token));
  if (user) {
    user.hash = await hashPassword(password);
    user.resetPasswordToken = null;
    await knex('user').update(user);
    return user;
  }
  return undefined;
};
