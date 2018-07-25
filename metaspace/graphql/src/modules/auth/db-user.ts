import * as bcrypt from 'bcrypt';
import * as uuid from 'uuid';

import config from '../../utils/config';
import {createExpiry} from "./utils";
import {knex, DbRow, updateTable} from './db';
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

export const findUserById = async (id: number): Promise<DbUser | undefined> => {
  return await knex('user').where('id', id).first();
};

export const findUserByEmail = async (email: string): Promise<DbUser | undefined> => {
  return await knex('user').whereRaw('LOWER(email) = ?', email.toLowerCase()).first();
};

export const findUserByGoogleId = async (googleId: string): Promise<DbUser | undefined> => {
  return await knex('user').where('googleId', googleId);
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

export const createUser = async (userDetails: NewDbUser): Promise<void> => {
  const existingUser = await findUserByEmail(userDetails.email);
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

export const verifyEmail = async (email: string, token: string): Promise<DbUser | undefined> => {
  const user = await findUserByEmail(email);
  if (user) {
    if (user.emailVerificationToken !== token || tokenExpired(user.emailVerificationTokenExpires)) {
      console.log(`Token is wrong or expired for ${email}`);
    }
    else {
      const updUser = {
        ...user,
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpires: null,
      };
      await updateTable('user', updUser);
      console.log(`Verified user email ${email}`);
      return updUser;
    }
  }
  else {
    console.log(`User with ${email} does not exist`);
  }
};

export const sendResetPasswordToken = async (email: string): Promise<void> => {
  const user = await findUserByEmail(email);
  if (user == null) {
    throw new Error(`User with ${email} email does not exist`);
  }

  let resetPasswordToken;
  if (user.resetPasswordToken == null || tokenExpired(user.resetPasswordTokenExpires)) {
    console.error(`Token has already expired for ${email}. Generate a new one`);
    resetPasswordToken = uuid.v4();
    const updUser = {
      ...user,
      resetPasswordToken,
      resetPasswordTokenExpires: createExpiry()
    };
    await updateTable('user', updUser);
  }
  else {
    resetPasswordToken = user.resetPasswordToken;
  }
  const link = `${config.web_public_url}/#/account/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetPasswordToken)}`;
  emailService.sendResetPasswordEmail(email, link);
  console.log(`Sent password reset email to ${email}: ${link}`);
};

export const resetPassword = async (email: string, password: string, token: string): Promise<DbUser | undefined> => {
  const user = await findUserByEmail(email);
  if (user) {
    if (user.resetPasswordToken !== token || tokenExpired(user.resetPasswordTokenExpires)) {
      console.log(`Token is wrong or expired for ${email}`);
    }
    else {
      const updUser = {
        ...user,
        hash: await hashPassword(password),
        resetPasswordToken: null,
        resetPasswordTokenExpires: null
      };
      await updateTable('user', updUser);
      console.log(`Successful password reset: ${email}`);
      return updUser;
    }
  }
};
