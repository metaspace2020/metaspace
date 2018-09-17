const express = require('express'),
      webpack = require('webpack'),
      favicon = require('serve-favicon'),
      Raven = require('raven');

const env = process.env.NODE_ENV || 'development';
const conf = require('./conf.js');

const configureAppServer = (app) => {
  app.get('/', (req, res, next) =>
    res.sendFile(__dirname + '/index.html'));

  if (env === 'development') {
    const webpackDevMiddleware = require('webpack-dev-middleware');
    const webpackHotMiddleware = require('webpack-hot-middleware');
    const config = require('./webpack.dev.config.js');
    const compiler = webpack(config);

    app.use(webpackDevMiddleware(compiler, config.devServer));
    app.use(webpackHotMiddleware(compiler));

    app.set('views', __dirname);
    app.engine('html', require('ejs').renderFile);
    app.set('view engine', 'html');
  } else {
    const compression = require('compression');
    app.use(compression());
    app.use('/dist', express.static('dist', {
      // Cache headers must be specified, or else some browsers automatically start caching JS files
      maxAge: '10m'
    }));
  }
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
  if (conf.UPLOAD_DESTINATION === 's3') {
    app.use('/upload', require('./fineUploaderS3Middleware.js')());
  } else {
    app.use('/upload', require('./fineUploaderLocalMiddleware.js')());
  }
};

const startServer = () => {
  const app = express();

  configureRavenRequestHandler(app);

  app.use(favicon(__dirname + '/static/favicon.ico'));

  configureAppServer(app);
  configureUploadHandler(app);
  configureRavenErrorHandler(app);

  app.listen(conf.PORT, () => {
    console.log(`listening on ${conf.PORT} port`);
  });
};

startServer();
