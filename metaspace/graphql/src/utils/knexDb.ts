import config from './config'
import * as Knex from 'knex'
import { UserError } from 'graphql-errors'

/** @deprecated Use TypeORM instead */
export let db: Knex // Don't initialize immediately as tests may need to set up the DB first.
