var express = require('express');
var webpack = require('webpack');
var passport = require('passport');
var bodyParser = require('body-parser');
var favicon = require('serve-favicon');

var session = require('express-session');
var GoogleAuth = require('google-auth-library');

var env = process.env.NODE_ENV || 'development';
var conf;
if (env == 'production')
  conf = require('./conf.prod.js');
else
  conf = require('./conf.js');

var fineUploaderMiddleware;
if (conf.UPLOAD_DESTINATION != 'S3')
  fineUploaderMiddleware = require('express-fineuploader-traditional-middleware');
else
  fineUploaderMiddleware = require('./fineUploaderS3Middleware.js');

var auth = new GoogleAuth;
var googleClient = new auth.OAuth2(conf.GOOGLE_CLIENT_ID, '', '');

var app = express();

var jwt = require('jwt-simple');

var pg = require('pg');

pg.on('error', function(error) {
  console.log(error);
});

app.use(session({
  store: new (require('connect-pg-simple')(session))({
    pg: pg,
    conString: conf.DB_CONN_STRING
  }),
  secret: conf.COOKIE_SECRET,
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 1 month
}));

app.use(favicon(__dirname + '/static/favicon.ico'))
app.use(bodyParser.json());
app.use(passport.initialize());
app.use(passport.session());

var router = express.Router();
router.post('/googleSignIn', (req, res, next) => {
  const callback = (err, login) => {
    if (err) {
      res.json({
        status: 'failure'
      })
    } else {
      var payload = login.getPayload();
      var userId = payload['sub'];
      req.session.client = {
        client_id: userId,
        name: payload['name'],
        email: payload['email']
      };
      res.json({
        status: 'success'
      });
    }
  };

  googleClient.verifyIdToken(req.body.id_token, conf.GOOGLE_CLIENT_ID, callback);
});

router.post('/googleSignOut', (req, res, next) => {
  req.session.destroy();
  res.json({
    status: 'destroyed'
  });
});

function getRole(email) {
  if (conf.ADMIN_EMAILS.indexOf(email) != -1)
    return 'admin';
  else
    return 'user';
}

// Gives a one-time token, which expires in 60 seconds.
// (this allows small time discrepancy between different servers)
// If we want to use longer lifetimes we need to setup HTTPS on all servers.
router.get('/getToken', (req, res, next) => {
  console.log(req.session.client);
  if (!req.session.client) {
    res.sendStatus(403);
    return;
  }

  var payload = {
    'iss': 'METASPACE2020',
    'sub': req.session.client.client_id,
    'name': req.session.client.name,
    'email': req.session.client.email,
    'exp': Math.floor(Date.now() / 1000 + 60),
    'role': getRole(req.session.client.email)
  }
  res.send(jwt.encode(payload, conf.JWT_SECRET));
})


if (env == 'development') {
  var webpackDevMiddleware = require('webpack-dev-middleware');
  var webpackHotMiddleware = require('webpack-hot-middleware');

  var config = require('./webpack.dev.config.js');
  config.plugins.push(new webpack.HotModuleReplacementPlugin());
  config.plugins.push(new webpack.NoErrorsPlugin());
  var compiler = webpack(config);

  app.use(webpackDevMiddleware(compiler, {
    publicPath: config.output.publicPath,
    stats: {colors: true}
  }));

  app.use(webpackHotMiddleware(compiler, {
    log: console.log
  }));

  router.get('/', (req, res, next) => res.render('index.html'));
  app.set('views', __dirname);
  app.engine('html', require('ejs').renderFile);
  app.set('view engine', 'html');

} else {
  var compression = require('compression');
  app.use(compression());
  app.use(express.static('.'));
}

app.use(router);
app.use('/upload', fineUploaderMiddleware());

app.listen(conf.PORT, () => {
  console.log(`listening on ${conf.PORT} port`);
})
