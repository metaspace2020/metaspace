import {defaults} from 'lodash';

export interface DbUser {
  id: string;
  email: string;
  password: string | null;
  name: string | null;
  role: string | null;
  googleId: string | null;
  emailVerificationToken: string | null;
  resetPasswordToken: string | null;
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

export const createUser = async (user: NewDbUser): Promise<Readonly<DbUser>> => {
  const newUser = {
    ...defaults({}, user, {
      password: null,
      name: null,
      googleId: null,
      role: 'user',
    }),
    id: users.length.toString(),
    emailVerificationToken: '123',
    resetPasswordToken: null,
  };
  users.push(newUser);
  return newUser;
};

export const verifyEmail = async (email: string, token: string): Promise<Readonly<DbUser> | undefined> => {
  return users.find(u => u.email === email && u.emailVerificationToken === token);
};

export const createResetPasswordToken = async (userId: string): Promise<string> => {
  const user = users.find(u => u.id === userId);
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
