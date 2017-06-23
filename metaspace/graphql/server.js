const bodyParser = require('body-parser'),
  compression = require('compression'),
  addIsoImageProvider = require('./imageUpload.js'),
  Resolvers = require('./resolvers.js'),
  config = require('config'),
  express = require('express'),
  fetch = require('node-fetch'),
  graphqlExpress = require('graphql-server-express').graphqlExpress,
  graphiqlExpress = require('graphql-server-express').graphiqlExpress,
  jsondiffpatch = require('jsondiffpatch'),
  jwt = require('jwt-simple'),
  cors = require('cors'),
  knex = require('knex'),
  makeExecutableSchema = require('graphql-tools').makeExecutableSchema,
  moment = require('moment'),
  readFile = require('fs').readFile,
  slack = require('node-slack'),
  sprintf = require('sprintf-js'),
  logger = require('./utils.js').logger;

// subscriptions setup
const http = require('http'),
      { execute, subscribe } = require('graphql'),
      { SubscriptionServer } = require('subscriptions-transport-ws');

let app = express();
let wsServer = http.createServer((req, res) => {
  res.writeHead(404);
  res.end();
});

readFile('schema.graphql', 'utf8', (err, contents) => {
  const schema = makeExecutableSchema({
    typeDefs: contents,
    resolvers: Resolvers,
    logger
  });

  app.use(cors());
  app.use(compression());
  app.use('/graphql', bodyParser.json({ type: '*/*' }), graphqlExpress({ schema }));
  app.use('/graphiql', graphiqlExpress({
    endpointURL: '/graphql',
    subscriptionsEndpoint: config.websocket_public_url,
  }));

  addIsoImageProvider(app);

  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    logger.error(err.stack);
    res.json({
      message: err.message
    });
  });

  app.listen(config.port);

  wsServer.listen(5000, () => {
    SubscriptionServer.create({ execute, subscribe, schema }, {
      server: wsServer,
      path: '/graphql',
    });
  });

  logger.info(`SM GraphQL is running on ${config.port} port...`);
});

module.exports = app; // for testing
