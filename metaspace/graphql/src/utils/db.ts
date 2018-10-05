import 'reflect-metadata';
import {
  createConnection as createTypeORMConnection,
  ConnectionOptions
} from 'typeorm';

import config from './config';
import {Credentials} from '../modules/auth/model';
import {User} from '../modules/user/model';
import {Dataset, DatasetProject} from '../modules/dataset/model';
import {Group, UserGroup} from '../modules/group/model';
import {Project, UserProject} from '../modules/project/model';

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
    DatasetProject,
    Group,
    UserGroup,
    Project,
    UserProject,
  ],
  synchronize: true,
  logging: false
};

export const createConnection = async () => {
  return await createTypeORMConnection({
    ...defaultDBConfig
  });
};
