import { ConnectionOptions } from 'typeorm'
import config from './config'
import { AUTH_ENTITIES } from '../modules/auth/model'
import { USER_ENTITIES } from '../modules/user/model'
import { DATASET_ENTITIES } from '../modules/dataset/model'
import { GROUP_ENTITIES } from '../modules/group/model'
import { PROJECT_ENTITIES } from '../modules/project/model'
import { ANNOTATION_ENTITIES } from '../modules/annotation/model'
import { ENGINE_ENTITIES } from '../modules/engine/model'
import { MOLECULAR_DB_ENTITIES } from '../modules/moldb/model'
import { ENRICHMENT_DB_ENTITIES } from '../modules/enrichmentdb/model'
import { IMAGE_VIEWER_SNAPSHOT_ENTITIES } from '../modules/imageViewerSnapshot/model'
import { SnakeCaseNamingStrategy } from './SnakeCaseNamingStrategy'

export const DbSchemaName = 'graphql'

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
    ...ENRICHMENT_DB_ENTITIES,
    ...IMAGE_VIEWER_SNAPSHOT_ENTITIES,
  ],
  namingStrategy: new SnakeCaseNamingStrategy(),
  synchronize: false,
  migrations: ['src/migrations/*.ts'],
  migrationsRun: true,
  logging: ['error', 'warn'], // "query"|"schema"|"error"|"warn"|"info"|"log"|"migration"
  maxQueryExecutionTime: 1000, // Threshold for logging slow queries, not a timeout
  cli: {
    migrationsDir: 'src/migrations',
  },
}

export default typeOrmConfig
