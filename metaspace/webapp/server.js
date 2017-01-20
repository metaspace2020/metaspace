var express = require('express');
var webpack = require('webpack');
var passport = require('passport');
var bodyParser = require('body-parser');

var session = require('express-session');
var GoogleAuth = require('google-auth-library');

var env = process.env.NODE_ENV || 'development';
var conf = require('./conf.js');

var auth = new GoogleAuth;
var googleClient = new auth.OAuth2(conf.GOOGLE_CLIENT_ID, '', '');

var app = express();

app.use(session({
  store: new (require('connect-pg-simple')(session))({
    conString: conf.DB_CONN_STRING
  }),
  secret: conf.COOKIE_SECRET,
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 1 month
}));

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

if (env == 'development') {
  var webpackDevMiddleware = require('webpack-dev-middleware');
  var webpackHotMiddleware = require('webpack-hot-middleware');

  var config = require('./webpack.dev.config.js');
  config.plugins.push(new webpack.HotModuleReplacementPlugin());
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
  app.use(router);

} else {
  var compression = require('compression');
  app.use(compression());
  app.use(express.static('.'));
}

app.listen(conf.PORT, () => {
  console.log(`listening on ${conf.PORT} port`);
})
