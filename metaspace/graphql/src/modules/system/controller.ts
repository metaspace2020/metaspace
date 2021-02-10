import * as path from 'path'
import * as fs from 'fs'
import * as _ from 'lodash'
import { promisify } from 'util'
import { UserError } from 'graphql-errors'
import { SystemHealth, UpdateSystemHealthInput } from '../../binding'
import { IResolvers } from 'graphql-tools'
import { Context } from '../../context'
import { asyncIterateSystemHealthUpdated, publishSystemHealthUpdated } from '../../utils/pubsub'

const healthFile = path.join(path.dirname(require.main!.filename), 'health.json')
const defaultHealth: SystemHealth = {
  canMutate: true,
  canProcessDatasets: true,
  message: null as any as undefined, // Workaround - binding.ts uses optional fields, but Apollo sends nulls
}

let currentHealth: Promise<SystemHealth> = (async() => {
  try {
    return {
      ...defaultHealth,
      ...JSON.parse(await promisify(fs.readFile)(healthFile, 'utf8')),
    }
  } catch {
    return defaultHealth
  }
})()

export const getHealth = async() => await currentHealth

export const Resolvers: IResolvers<any, Context> = {
  Query: {
    async systemHealth(): Promise<SystemHealth> {
      return await currentHealth
    },
  },

  Mutation: {
    async updateSystemHealth(source: any, { health: _health }: any, { user }: Context) {
      const health = _health as UpdateSystemHealthInput
      if (user && user.role === 'admin') {
        const newHealth = { ...defaultHealth, ...health }
        currentHealth = Promise.resolve(newHealth)
        await publishSystemHealthUpdated(newHealth)

        // Don't persist to disk in development mode, as it triggers nodemon to restart the process
        if (process.env.NODE_ENV !== 'development') {
          if (_.isEqual(newHealth, defaultHealth)) {
            const fileExists = await promisify(fs.stat)(healthFile).then(() => true, () => false)
            if (fileExists) {
              await promisify(fs.unlink)(healthFile)
            }
          } else {
            await promisify(fs.writeFile)(healthFile, JSON.stringify(newHealth), 'utf-8')
          }
        }

        return null
      } else {
        throw new UserError('Not authorized')
      }
    },
  },

  Subscription: {
    systemHealthUpdated: {
      subscribe: asyncIterateSystemHealthUpdated,
      resolve: (payload: SystemHealth) => payload,
    },
  },
}
