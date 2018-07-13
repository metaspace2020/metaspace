import {defaults} from 'lodash';

export interface DbUser {
  id: string;
  email: string;
  password: string | null;
  name: string | null;
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
    }),
    id: users.length.toString(),
    emailVerificationToken: '123',
    resetPasswordToken: null,
  };
  users.push(newUser);
  return newUser;
};

export const createResetPasswordToken = async (userId: string): Promise<string> => {
  const user = users.find(u => u.id === userId);
  if (!user) {
    throw new Error();
  }
  user.resetPasswordToken = new Date().valueOf().toString();
  return user.resetPasswordToken;
};

export const setUserPassword = async (userId: string, password: string): Promise<Readonly<DbUser>> => {
  const user = users.find(u => u.id === userId);
  if (!user) {
    throw new Error();
  }
  user.password = password;
  user.resetPasswordToken = null;
  return user;
};
