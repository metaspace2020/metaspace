const express = require('express'),
      knex = require('knex'),
      pgp = require('pg-promise'),
      bodyParser = require('body-parser'),
      cors = require('cors'),
      compression = require('compression'),
      sprintf = require('sprintf-js'),
      capitalize = require('lodash/capitalize'),
      fetch = require('node-fetch'),
      readFile = require('fs').readFile,
      smEngineConfig = require('./config.json'),
      makeExecutableSchema = require('graphql-tools').makeExecutableSchema,
      graphqlExpress = require('graphql-server-express').graphqlExpress,
      graphiqlExpress = require('graphql-server-express').graphiqlExpress;

const MOL_IMAGE_SERVER_IP = "52.51.114.30:3020";
const addIsoImageProvider = require('./image_upload.js'),
  Resolvers = require('./resolvers.js');

// private EC2 IP with a few endpoints that are still used
const OLD_WEBAPP_IP_PRIVATE = "172.31.47.69";

const logger = { log: (e) => console.log(e) };

const PORT = 3010;

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
  
  addIsoImageProvider(app, '/upload', 4);

  app.listen(PORT);
});