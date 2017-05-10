const bodyParser = require('body-parser'),
  compression = require('compression'),
  addIsoImageProvider = require('./imageUpload.js'),
  Resolvers = require('./resolvers.js'),
  config = require('./config.js'),
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

let app = express();

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
    endpointURL: '/graphql'
  }));
  
  addIsoImageProvider(app);
  
  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    logger.error(err.stack);
    res.json({
      message: err.message
    });
  });
  
  app.listen(config.PORT);
  logger.info('SM GraphQL is running...');
});

module.exports = app; // for testing
