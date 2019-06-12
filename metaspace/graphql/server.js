// Before loading anything graphql-related, polyfill Symbol.asyncIterator because it's needed by TypeScript to support
// async iterators, and the 'iterall' package imported by graphql-js will make its own symbol and reject others
// if this isn't defined when 'iterall' is loaded

Symbol.asyncIterator = Symbol.asyncIterator || Symbol.for("Symbol.asyncIterator");
if (require('iterall').$$asyncIterator !== Symbol.asyncIterator) {
  throw new Error('iterall is using the wrong symbol for asyncIterator')
}


const bodyParser = require('body-parser'),
  compression = require('compression'),
  config = require('./src/utils/config').default,
  express = require('express'),
  session = require('express-session'),
  connectRedis = require('connect-redis'),
  Sentry = require('@sentry/node'),
  {ApolloServer} = require('apollo-server-express'),
  jwt = require('express-jwt'),
  jwtSimple = require('jwt-simple'),
  cors = require('cors'),
  {IsUserError} = require('graphql-errors');

const {createImgServerAsync} = require('./imageUpload.js'),
  {configureAuth} = require('./src/modules/auth'),
  {initDBConnection} = require('./src/utils/knexDb'),
  {logger} = require('./utils'),
  {createConnection} = require('./src/utils'),
  {executableSchema} = require('./executableSchema'),
  getContext = require('./src/getContext').default;

// subscriptions setup
const http = require('http'),
      { execute, subscribe, GraphQLError } = require('graphql'),
      { SubscriptionServer } = require('subscriptions-transport-ws');

const env = process.env.NODE_ENV || 'development';

let wsServer = http.createServer((req, res) => {
  res.writeHead(404);
  res.end();
});


const configureSession = (app) => {
  let sessionStore = undefined;
  if (config.redis.host) {
    const RedisStore = connectRedis(session);
    sessionStore = new RedisStore(config.redis);
  }

  app.use(session({
    store: sessionStore,
    secret: config.cookie.secret,
    saveUninitialized: true,
    resave: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 1 month
    name: 'api.sid',
  }));
};

const configureSentryRequestHandler = (app) => {
  // if (env !== 'development' && config.sentry.dsn) {
  if (config.sentry.dsn) {
    Sentry.init({ dsn: config.sentry.dsn });
    // Sentry.Handlers.requestHandler should be the first middleware
    app.use(Sentry.Handlers.requestHandler());
  }
};

const configureSentryErrorHandler = (app) => {
  // if (env !== 'development' && config.sentry.dsn) {
  if (config.sentry.dsn) {
    // Raven.errorHandler should go after all normal handlers/middleware, but before any other error handlers
    app.use(Sentry.Handlers.errorHandler());
  }
};

const formatGraphQLError = (error) => {
  const {message, extensions, source, path, name, positions} = error;
  const isUserError = extensions && extensions.exception && extensions.exception[IsUserError] === true;

  if (!isUserError) {
    if (error instanceof GraphQLError) {
      logger.error(extensions.exception || message, source);
    } else {
      logger.error(error);
    }

    Sentry.withScope(scope => {
      scope.setExtras({
        source: source && source.body,
        positions,
        path,
      });
      if (path || name !== 'GraphQLError') {
        scope.setTag('graphql', 'exec_error');
        Sentry.captureException(error);
      } else {
        scope.setTag('graphql', 'bad_query');
        Sentry.captureMessage(`GraphQLBadQuery: ${error.message}`)
      }
    });
  }

  return error;
};

async function createHttpServerAsync(config) {
  let app = express();
  let httpServer = http.createServer(app);

  configureSentryRequestHandler(app);

  app.use(cors());
  app.use(compression());
  app.use(jwt({
    secret: config.jwt.secret,
    // issuer: config.jwt.issuer, // TODO: Add issuer to config so that it can be validated
    credentialsRequired: false,
  }));

  const connection = await createConnection();

  app.use(bodyParser.json());
  configureSession(app);
  await configureAuth(app, connection.manager);


  const apollo = new ApolloServer({
    schema: executableSchema,
    context: ({req, res}) => getContext(req.user && req.user.user, connection.manager, req, res),
    playground: {
      settings: {
        'editor.theme': 'light',
        'editor.cursorShape': 'line',
      }
    },
    formatError: formatGraphQLError,
    introspection: true,
  });
  apollo.applyMiddleware({ app });

  configureSentryErrorHandler(app);

  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    logger.error(err.stack);
    res.json({
      message: err.message
    });
  });

  wsServer.listen(config.ws_port, (err) => {
    if (err) {
      logger.error('Could not start WebSocket server', err);
    }
    logger.info(`WebSocket server is running on ${config.ws_port} port...`);
    SubscriptionServer.create({
      execute,
      subscribe,
      schema: executableSchema,
      onOperation(message, params) {
        const jwt = message.payload.jwt;
        const user = jwt != null ? jwtSimple.decode(jwt, config.jwt.secret, false, config.jwt.algorithm) : null;
        params.context = getContext(user && user.user, connection.manager, null, null);
        params.formatError = formatGraphQLError;
        return params;
      }
    }, {
      server: wsServer,
      path: '/graphql',
    });
  });

  httpServer.listen(config.port);
  logger.info(`SM GraphQL is running on ${config.port} port...`);
  return httpServer;
}

if (process.argv[1].endsWith('server.js')) {
  const db = initDBConnection();
  createHttpServerAsync(config)
    .catch(e => {
      logger.error(e);
    });
  createImgServerAsync(config, db);
}

module.exports = {createHttpServerAsync, wsServer}; // for testing
