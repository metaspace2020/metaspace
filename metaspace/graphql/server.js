const bodyParser = require('body-parser'),
  compression = require('compression'),
  config = require('config'),
  express = require('express'),
  session = require('express-session'),
  connectRedis = require('connect-redis'),
  {graphqlExpress, graphiqlExpress} = require('apollo-server-express'),
  jwt = require('express-jwt'),
  cors = require('cors'),
  {makeExecutableSchema, addResolveFunctionsToSchema, addErrorLoggingToSchema, addMockFunctionsToSchema} = require('graphql-tools'),
  {mergeTypes} = require('merge-graphql-schemas'),
  {maskErrors} = require('graphql-errors'),
  {promisify} = require('util'),
  readFile = promisify(require("fs").readFile);

const {createImgServerAsync} = require('./imageUpload.js'),
  {configureAuth, initSchema} = require('./src/modules/auth'),
  Resolvers = require('./resolvers'),
  {logger, initDBConnection} = require('./utils');

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

function createHttpServerAsync(config) {
  let app = express();
  let httpServer = http.createServer(app);

  return initSchema()
    .then(async () => {
      return mergeTypes([
        await readFile('schema.graphql', 'utf8'),
        await readFile('schemas/user.graphql', 'utf8'),
        await readFile('schemas/group.graphql', 'utf8'),
      ]);
    })
    .then((mergedSchema) => {
      const schema = makeExecutableSchema({typeDefs: mergedSchema});
      addResolveFunctionsToSchema(schema, Resolvers);
      addErrorLoggingToSchema(schema, logger);

      if (process.env.NODE_ENV === 'development') {
        addMockFunctionsToSchema({schema, preserveResolvers: true});
      } else {
        maskErrors(schema);
      }

      app.use(cors());
      app.use(compression());
      app.use(jwt({
        secret: config.jwt.secret,
        // issuer: config.jwt.issuer, // TODO: Add issuer to config so that it can be validated
        credentialsRequired: false,
      }));
      app.use('/graphql',
          bodyParser.json({type: '*/*'}),
          graphqlExpress(req => ({
            schema,
            context: req
          })));
      app.use('/graphiql', graphiqlExpress({
        endpointURL: '/graphql',
        subscriptionsEndpoint: config.websocket_public_url,
      }));

      if (config.features.newAuth) {
        app.use(bodyParser.json());
        configureSession(app);
        configureAuth(app);
      }

      app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        logger.error(err.stack);
        res.json({
          message: err.message
        });
      });


      httpServer.listen(config.port);

      wsServer.listen(config.ws_port, (err) => {
        if (err) {
          logger.error('Could not start WebSocket server', err)
        }
        logger.info(`WebSocket server is running on ${config.ws_port} port...`);
        SubscriptionServer.create({execute, subscribe, schema}, {
          server: wsServer,
          path: '/graphql',
        });
      });

      logger.info(`SM GraphQL is running on ${config.port} port...`);

      return httpServer;
    })
}

if (process.argv[1].endsWith('server.js')) {
  createHttpServerAsync(config);
  createImgServerAsync(config, initDBConnection());
}

module.exports = {createHttpServerAsync, wsServer}; // for testing
