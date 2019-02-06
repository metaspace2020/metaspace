import {ConnectionOptions} from 'typeorm';
import config from './config';
import {Credentials} from '../modules/auth/model';
import {User} from '../modules/user/model';
import {Dataset, DatasetProject} from '../modules/dataset/model';
import {Group, UserGroup} from '../modules/group/model';
import {Project, UserProject} from '../modules/project/model';

export const DbSchemaName = 'graphql';

const typeOrmConfig: ConnectionOptions = {
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
  logging: ['error', 'warn', 'info', 'log'],
};

export default typeOrmConfig;
