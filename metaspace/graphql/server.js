const express = require('express'),
      knex = require('knex'),
      bodyParser = require('body-parser'),
      cors = require('cors'),
      compression = require('compression'),
      readFile = require('fs').readFile,
      makeExecutableSchema = require('graphql-tools').makeExecutableSchema,
      graphqlExpress = require('graphql-server-express').graphqlExpress,
      graphiqlExpress = require('graphql-server-express').graphiqlExpress;

const addIsoImageProvider = require('./imageUpload.js'),
  Resolvers = require('./resolvers.js'),
  config = require('./config.js');

const logger = { log: (e) => console.log(e) };

var app = express();

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
  
  addIsoImageProvider(app, '/upload');

  app.listen(config.PORT);
});
