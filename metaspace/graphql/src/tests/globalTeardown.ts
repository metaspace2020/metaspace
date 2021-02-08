import * as Knex from 'knex'
import config from '../utils/config'

export = async() => {
  const knexAdmin = Knex({
    client: 'postgres',
    connection: {
      host: config.db.host,
      user: 'sm',
      password: 'password',
      database: 'postgres',
    },
    debug: false,
  })

  await knexAdmin.raw(`DROP DATABASE ${config.db.database}`)
  await knexAdmin.destroy()
};
