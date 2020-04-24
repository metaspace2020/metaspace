import { ConnectionOptions } from 'typeorm';
import config from './config';
import { AUTH_ENTITIES } from '../modules/auth/model';
import { USER_ENTITIES } from '../modules/user/model';
import { DATASET_ENTITIES } from '../modules/dataset/model';
import { GROUP_ENTITIES } from '../modules/group/model';
import { PROJECT_ENTITIES } from '../modules/project/model';
import { ANNOTATION_ENTITIES } from '../modules/annotation/model';
import { ENGINE_ENTITIES } from '../modules/engine/model';
import { MOLECULAR_DB_ENTITIES } from '../modules/moldb/model';
import { SnakeCaseNamingStrategy } from './SnakeCaseNamingStrategy';
import * as pg from 'pg'

// https://github.com/typeorm/typeorm/issues/4519#issuecomment-606319943
// all `Date`s should be assumed to be in UTC when being sent to Postgres
pg.defaults.parseInputDatesAsUTC = true;
// all dates received from Postgres should be assumed to be UTC when converted to `Date`s
const TIMESTAMP = '1114' // https://github.com/brianc/node-pg-types/blob/master/lib/builtins.js#L47
pg.types.setTypeParser(TIMESTAMP, (stringValue: string) => new Date(`${stringValue}Z`));

export const DbSchemaName = 'graphql';

const typeOrmConfig: ConnectionOptions = {
  type: 'postgres',
  host: config.db.host,
  database: config.db.database,
  username: config.db.user,
  password: config.db.password,
  schema: DbSchemaName,
  entities: [
    ...AUTH_ENTITIES,
    ...USER_ENTITIES,
    ...DATASET_ENTITIES,
    ...GROUP_ENTITIES,
    ...PROJECT_ENTITIES,
    ...ANNOTATION_ENTITIES,
    ...ENGINE_ENTITIES,
    ...MOLECULAR_DB_ENTITIES,
  ],
  namingStrategy: new SnakeCaseNamingStrategy(),
  synchronize: false,
  migrations: ['src/migrations/*.ts'],
  migrationsRun: true,
  logging: ['error', 'warn', 'info', 'log'],
  cli: {
    migrationsDir: 'src/migrations'
  }
};

export default typeOrmConfig;
