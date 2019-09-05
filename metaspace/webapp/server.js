const express = require('express'),
      favicon = require('serve-favicon'),
      Raven = require('raven'),
      connectHistoryApiFallback = require('connect-history-api-fallback');

const env = process.env.NODE_ENV || 'development';
const conf = require('./conf.js');

const configureAppServer = (app) => {

  const compression = require('compression');
  app.use(compression());
  app.use('/dist', express.static('dist', {
    // Cache headers must be specified, or else some browsers automatically start caching JS files
    maxAge: '10m'
  }));

  app.use(connectHistoryApiFallback({index: '/'})); // Rewrite unknown non-file paths to serve index.html
  app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
};

const configureRavenRequestHandler = (app) => {
  if (env !== 'development' && conf.RAVEN_DSN != null && conf.RAVEN_DSN !== '') {
    Raven.config(conf.RAVEN_DSN).install();
    // Raven.requestHandler should be the first middleware
    app.use(Raven.requestHandler());
  }
};

const configureRavenErrorHandler = (app) => {
  if (env !== 'development' && conf.RAVEN_DSN != null && conf.RAVEN_DSN !== '') {
    // Raven.errorHandler should go after all normal handlers/middleware, but before any other error handlers
    app.use(Raven.errorHandler());
  }
};

const configureUploadHandler = (app) => {
  // if (conf.UPLOAD_DESTINATION === 's3') {
  //   app.use('/upload', require('../graphql/src/modules/webServer/fineUploaderS3Middleware.js')());
  // } else {
  //   app.use('/upload', require('../graphql/src/modules/webServer/fineUploaderLocalMiddleware.js')());
  // }
};

const startServer = () => {
  const app = express();

  configureRavenRequestHandler(app);

  app.use(favicon(__dirname + '/static/favicon.ico'));

  configureUploadHandler(app);
  // Keep configureAppServer as the last route handler, because connectHistoryApiFallback rewrites unhandled routes to serve index.html
  configureAppServer(app);
  configureRavenErrorHandler(app);

  app.listen(conf.PORT, () => {
    console.log(`listening on ${conf.PORT} port`);
  });
};

startServer();
