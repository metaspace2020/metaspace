const bodyParser = require('body-parser'),
  compression = require('compression'),
  {createImgServerAsync} = require('./imageUpload.js'),
  Resolvers = require('./resolvers.js'),
  config = require('config'),
  express = require('express'),
  fetch = require('node-fetch'),
  {graphqlExpress, graphiqlExpress} = require('apollo-server-express'),
  jsondiffpatch = require('jsondiffpatch'),
  jwt = require('express-jwt'),
  cors = require('cors'),
  knex = require('knex'),
  makeExecutableSchema = require('graphql-tools').makeExecutableSchema,
  {maskErrors} = require('graphql-errors'),
  moment = require('moment'),
  Promise = require("bluebird"),
  slack = require('node-slack'),
  sprintf = require('sprintf-js'),
  readFile = Promise.promisify(require("fs").readFile);

const logger = require('./utils.js').logger;

// subscriptions setup
const http = require('http'),
      { execute, subscribe } = require('graphql'),
      { SubscriptionServer } = require('subscriptions-transport-ws');

let wsServer = http.createServer((req, res) => {
  res.writeHead(404);
  res.end();
});

function createHttpServerAsync(config) {
  let app = express();
  let httpServer = http.createServer(app);

  return readFile('schema.graphql', 'utf8')
    .then((contents) => {
      const schema = makeExecutableSchema({
        typeDefs: contents,
        resolvers: Resolvers,
        logger
      });

      if (process.env.NODE_ENV !== 'development') {
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
    .catch((err) => {
      logger.error(`Failed to init http server: ${err}`);
    })
}

if (process.argv[1].endsWith('server.js')) {
  createHttpServerAsync(config);
  createImgServerAsync(config);
}

module.exports = {createHttpServerAsync, wsServer}; // for testing
