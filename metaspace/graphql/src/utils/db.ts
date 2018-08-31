import 'reflect-metadata';
import {
  createConnection as createTypeORMConnection,
  ConnectionOptions
} from 'typeorm';

import config from './config';
import {Credentials} from '../modules/auth/model';
import {User, Dataset} from '../modules/user/model';
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
  logging: true
};

export const createConnection = async () => {
  return await createTypeORMConnection({
    ...defaultDBConfig
  });
};
