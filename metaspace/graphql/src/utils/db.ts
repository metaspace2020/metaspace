import 'reflect-metadata';
import {
  createConnection as createTypeORMConnection,
  ConnectionOptions, Connection
} from 'typeorm';

import config from './config';
import {Credentials} from '../modules/auth/model';
import {User as UserModel, User} from '../modules/user/model';
import {Dataset} from '../modules/dataset/model';
import {Group, UserGroup} from '../modules/group/model';

export const DbSchemaName = 'graphql';

const defaultDBConfig: ConnectionOptions = {
  type: 'postgres',
  host: config.db.host,
  database: config.db.database,
  username: config.db.user,
  password: config.db.password,
  schema: DbSchemaName,
  entities: [
    Credentials,
    User,
    Dataset,
    Group,
    UserGroup
  ],
  synchronize: true,
  logging: false
};

export const createConnection = async () => {
  return await createTypeORMConnection({
    ...defaultDBConfig
  });
};

export const findUserByEmail = async (connection: Connection, value: string, field: string='email') => {
  return await connection.getRepository(UserModel)
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.credentials', 'credentials')
    .where(`LOWER(${field}) = :email`, { email: value.toLowerCase() })
    .getOne() || null;
};