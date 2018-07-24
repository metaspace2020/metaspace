import {defaults} from 'lodash';
import config from '../../utils/config';

export interface DbUser {
  id: string;
  email: string;
  password: string | null;
  name: string | null;
  role: string | null;
  googleId: string | null;
  emailVerificationToken: string | null;
  resetPasswordToken: string | null;
  emailVerified: boolean | null;
}
export interface NewDbUser {
  email: string;
  password?: string;
  name?: string;
  googleId?: string;
}

// FIXME: This is just a stub and should obviously not be used in production. Passwords need to be salted & hashed
// (ideally by a 3rd party library), tokens need to be able to be expired, some mechanism should be added so that
// a user's other sessions are revoked when they change their password, etc.
const users: DbUser[] = [];

export const findUserById = async (id: string): Promise<Readonly<DbUser> | undefined> => {
  return users.find(u => u.id === id);
};

export const findUserByEmail = async (email: string): Promise<Readonly<DbUser> | undefined> => {
  return users.find(u => u.email === email);
};

export const findUserByGoogleId = async (googleId: string): Promise<Readonly<DbUser> | undefined> => {
  return users.find(u => u.googleId === googleId);
};

export const createUser = async (userDetails: NewDbUser): Promise<Readonly<void>> => {
  const existingUser = users.find(u => u.email === userDetails.email);
  if (existingUser == null) {
    const emailVerificationToken = new Date().valueOf().toString();
    const newUser = {
      email: userDetails.email,
      password: userDetails.password || null,
      name: userDetails.name || null,
      googleId: userDetails.googleId || null,
      role: 'user',
      id: users.length.toString(),
      emailVerificationToken,
      resetPasswordToken: null,
      emailVerified: false,
    };
    users.push(newUser);
    // TODO: Send email
    console.log(`${config.web_public_url}/api_auth/verifyemail?email=${encodeURIComponent(userDetails.email)}&token=${encodeURIComponent(emailVerificationToken)}`)
  } else if (!existingUser.emailVerified) {
    const emailVerificationToken = new Date().valueOf().toString();
    // TODO: Only regenerate token if it has expired
    existingUser.emailVerificationToken = emailVerificationToken;
    console.log(`Resend email verification: ${config.web_public_url}/api_auth/verifyemail?email=${encodeURIComponent(userDetails.email)}&token=${encodeURIComponent(emailVerificationToken)}`)
  } else {
    // TODO: Send email directing user to log in / reset password
    console.log(`Email already verified: ${existingUser.email}`);
  }
};

export const verifyEmail = async (email: string, token: string): Promise<Readonly<DbUser> | undefined> => {
  const user = users.find(u => u.email === email && u.emailVerificationToken === token);
  if (user) {
    user.emailVerified = true;
    user.emailVerificationToken = null;
  }
  return user;
};

export const createResetPasswordToken = async (email: string): Promise<string> => {
  const user = users.find(u => u.email === email);
  if (!user) {
    throw new Error();
  }
  user.resetPasswordToken = new Date().valueOf().toString();
  return user.resetPasswordToken;
};

export const resetPassword = async (email: string, password: string, token: string): Promise<Readonly<DbUser> | undefined> => {
  // TODO: token expiry, etc.
  const user = users.find(u => u.email === email && u.resetPasswordToken === token);
  if (user) {
    user.password = password;
    user.resetPasswordToken = null;
    return user;
  }
  return undefined;
};
