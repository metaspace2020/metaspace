const bodyParser = require('body-parser'),
  compression = require('compression'),
  config = require('config'),
  express = require('express'),
  session = require('express-session'),
  connectRedis = require('connect-redis'),
  {ApolloServer} = require('apollo-server-express'),
  jwt = require('express-jwt'),
  cors = require('cors'),
  {UserError} = require('graphql-errors');

const {createImgServerAsync} = require('./imageUpload.js'),
  {configureAuth} = require('./src/modules/auth'),
  {User, Dataset} = require('./src/modules/user/model'),
  {logger, initDBConnection} = require('./utils'),
  {createConnection} = require('./src/utils'),
  {executableSchema} = require('./executableSchema');

// subscriptions setup
const http = require('http'),
      { execute, subscribe } = require('graphql'),
      { SubscriptionServer } = require('subscriptions-transport-ws');

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

async function createHttpServerAsync(config) {
  let app = express();
  let httpServer = http.createServer(app);

  app.use(cors());
  app.use(compression());
  app.use(jwt({
    secret: config.jwt.secret,
    // issuer: config.jwt.issuer, // TODO: Add issuer to config so that it can be validated
    credentialsRequired: false,
  }));

  const connection = await createConnection();

  if (config.features.newAuth) {
    app.use(bodyParser.json());
    configureSession(app);
    await configureAuth(app, connection);
  }

  const apollo = new ApolloServer({
    schema: executableSchema,
    context: ({req}) => {
      return {
        user: req.user != null ? req.user.user : null,
        connection
      };
    },
    playground: {
      settings: {
        'editor.theme': 'light',
        'editor.cursorShape': 'line',
      }
    },
  });
  apollo.applyMiddleware({ app });

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
      schema: executableSchema
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
  createHttpServerAsync(config)
    .catch(e => {
      logger.error(e);
    });
  createImgServerAsync(config, initDBConnection());
}

module.exports = {createHttpServerAsync, wsServer}; // for testing
