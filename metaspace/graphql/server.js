import { utc } from 'moment'
import * as bodyParser from 'body-parser'
import * as compression from 'compression'
import * as http from 'http'
import * as express from 'express'
import * as session from 'express-session'
import * as connectRedis from 'connect-redis'
import * as Sentry from '@sentry/node'
import { ApolloServer } from 'apollo-server-express'
import * as jsonwebtoken from 'jsonwebtoken'
import * as cors from 'cors'
import { execute, subscribe, GraphQLError } from 'graphql'
import { IsUserError } from 'graphql-errors'
import { SubscriptionServer } from 'subscriptions-transport-ws'

import { sendPublishProjectNotificationEmail } from './src/modules/project/email'
import { createStorageServerAsync } from './src/modules/webServer/storageServer'
import { configureAuth } from './src/modules/auth'
import config from './src/utils/config'
import logger from './src/utils/logger'
import { createConnection } from './src/utils'
import { executableSchema } from './executableSchema'
import getContext, { getContextForSubscription } from './src/getContext'
import {
  Project as ProjectModel,
  UserProjectRoleOptions as UPRO,
} from './src/modules/project/model'
import { StructError } from 'superstruct'

const env = process.env.NODE_ENV || 'development'

const configureSession = (app) => {
  let sessionStore
  if (config.redis.host) {
    const RedisStore = connectRedis(session)
    sessionStore = new RedisStore(config.redis)
  }

  app.use(session({
    store: sessionStore,
    secret: config.cookie.secret,
    saveUninitialized: true,
    resave: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 1 month
    name: 'api.sid',
  }))
}

const configureSentryRequestHandler = (app) => {
  if (env !== 'development' && config.sentry.dsn) {
    Sentry.init(config.sentry)
    // Sentry.Handlers.requestHandler should be the first middleware
    app.use(Sentry.Handlers.requestHandler())
  }
}

const configureSentryErrorHandler = (app) => {
  if (env !== 'development' && config.sentry.dsn) {
    // Raven.errorHandler should go after all normal handlers/middleware, but before any other error handlers
    app.use(Sentry.Handlers.errorHandler({
      shouldHandleError(error) {
        if (error instanceof StructError || error[IsUserError] === true) {
          return false
        }
        // Default sentry behavior
        const statusCode = error?.status ?? error?.statusCode ?? error?.status_code ?? error?.output?.statusCode
        const status = statusCode ? parseInt(statusCode, 10) : 500
        return status >= 500
      },
    }))
  }
}

const formatGraphQLError = (error) => {
  const { message, extensions, source, path, name, positions } = error
  const isUserError = extensions && extensions.exception && extensions.exception[IsUserError] === true

  if (!isUserError) {
    if (error instanceof GraphQLError) {
      logger.error(extensions.exception || message, source)
    } else {
      logger.error(error)
    }

    Sentry.withScope(scope => {
      scope.setExtras({
        source: source && source.body,
        positions,
        path,
      })
      if (path || name !== 'GraphQLError') {
        scope.setTag('graphql', 'exec_error')
        Sentry.captureException(error)
      } else {
        scope.setTag('graphql', 'bad_query')
        Sentry.captureMessage(`GraphQLBadQuery: ${error.message}`)
      }
    })
  }

  return error
}

async function createSubscriptionServerAsync(config, connection) {
  const wsServer = http.createServer((req, res) => {
    res.writeHead(404)
    res.end()
  })

  await new Promise((resolve, reject) => {
    wsServer.listen(config.ws_port).on('listening', resolve).on('error', reject)
  })

  logger.info(`WebSocket server is running on ${config.ws_port} port...`)
  SubscriptionServer.create({
    execute,
    subscribe,
    schema: executableSchema,
    onOperation(message, params) {
      const jwt = message.payload.jwt
      const user = jwt != null
        ? jsonwebtoken.verify(jwt, config.jwt.secret, { algorithms: [config.jwt.algorithm] })
        : null
      params.context = getContextForSubscription(user && user.user, connection.manager)
      params.formatError = formatGraphQLError
      return params
    },
  }, {
    server: wsServer,
    path: '/graphql',
  })

  return wsServer
}

const configureCronSchedule = (entityManager) => {
  const CronJob = require('cron').CronJob

  const emailNotificationsHandler = async() => {
    try {
      const nDaysAgo = utc().subtract(180, 'days')
      const projects = await entityManager.createQueryBuilder('project', 'proj')
        .where('proj.review_token_created_dt < :nDaysAgo', { nDaysAgo })
        .andWhere('proj.publish_notifications_sent = :notifications_sent',
          { notifications_sent: 0 })
        .leftJoinAndSelect('proj.members', 'member')
        .andWhere('member.role = :role', { role: UPRO.MANAGER })
        .leftJoinAndSelect('member.user', 'user')
        .getMany()

      await Promise.all(
        projects.map(async project => {
          project.members.forEach(member => {
            sendPublishProjectNotificationEmail(member.user.email, project)
          })
          await entityManager.update(ProjectModel, project.id,
            { publishNotificationsSent: project.publishNotificationsSent + 1 })
        })
      )
    } catch (error) {
      logger.error(error)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises,no-new
  new CronJob('00 00 14 * * 1-5', emailNotificationsHandler, null, true)
  logger.info('Cron job started')
}

async function createHttpServerAsync(config, connection) {
  const app = express()
  const httpServer = http.createServer(app)

  configureSentryRequestHandler(app)

  app.use(cors())
  app.use(compression())

  configureCronSchedule(connection.manager)

  app.use(bodyParser.json())
  configureSession(app)
  await configureAuth(app, connection.manager)

  const apollo = new ApolloServer({
    schema: executableSchema,
    context: ({ req, res }) => getContext(req.user, connection.manager, req, res),
    playground: {
      settings: {
        'editor.theme': 'light',
        'editor.cursorShape': 'line',
      },
    },
    formatError: formatGraphQLError,
    introspection: true,
  })
  apollo.applyMiddleware({ app })

  configureSentryErrorHandler(app)

  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */ // Because express error handlers must take 4 args
  app.use(function(err, req, res, next) {
    res.status(err.status || 500)
    logger.error(err.stack)
    res.json({
      message: err.message,
    })
  })

  await new Promise((resolve, reject) => {
    httpServer.listen(config.port).on('listening', resolve).on('error', reject)
  })
  logger.info(`SM GraphQL is running on ${config.port} port...`)
  return httpServer
}

const main = async() => {
  try {
    const connection = await createConnection()

    const servers = await Promise.all([
      createSubscriptionServerAsync(config, connection),
      createHttpServerAsync(config, connection),
      createStorageServerAsync(config),
    ])

    // If any server dies for any reason, kill the whole process
    const closeListeners = servers.map(server => new Promise((resolve, reject) => {
      const address = server.address()
      server.on('close', () => reject(new Error(`Server at ${JSON.stringify(address)} closed unexpectedly`)))
    }))
    await Promise.all(closeListeners)
  } catch (error) {
    logger.error(error)
    process.exit(1)
  }
}

if (process.argv[1].endsWith('server.js')) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const ignoredPromise = main()
}

module.exports = { createHttpServerAsync } // for testing
