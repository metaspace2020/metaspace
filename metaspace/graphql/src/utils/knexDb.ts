import * as Knex from 'knex'

/** @deprecated Use TypeORM instead */
export let db: Knex // Don't initialize immediately as tests may need to set up the DB first.
