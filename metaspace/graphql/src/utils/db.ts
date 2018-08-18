import "reflect-metadata";
import {
  createConnection as createTypeORMConnection,
  ConnectionOptions} from "typeorm";

import config from './config';
import {Credentials} from '../modules/auth/model';
import {User} from '../modules/user/model';

export const DbSchemaName = 'graphql';

const defaultDBConfig: ConnectionOptions = {
  type: "postgres",
  host: config.db.host,
  database: config.db.database,
  username: config.db.user,
  password: config.db.password,
  schema: DbSchemaName,
  entities: [
    Credentials,
    User
  ],
  synchronize: true,
  logging: false
};

export const createConnection = async () => {
  return createTypeORMConnection({
    ...defaultDBConfig
  });
};

export interface DbRow {
  id: number;
}
