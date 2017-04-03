var express = require('express');
var webpack = require('webpack');
var passport = require('passport');
var bodyParser = require('body-parser');
var favicon = require('serve-favicon');

var session = require('express-session');

var GoogleStrategy = require('passport-google-oauth20').Strategy;

var env = process.env.NODE_ENV || 'development';
var conf = require('./conf.js');

var fineUploaderMiddleware;
if (conf.UPLOAD_DESTINATION != 'S3')
  fineUploaderMiddleware = require('express-fineuploader-traditional-middleware');
else
  fineUploaderMiddleware = require('./fineUploaderS3Middleware.js');

var app = express();

var jwt = require('jwt-simple');
var RedisStore = require('connect-redis')(session);

var knex = require('knex')({
  // FIXME: this is a temporary solution, use Postgres in the future
  client: 'sqlite3',
  connection: {
    filename: './db.sqlite'
  },
  useNullAsDefault: true
});

knex.schema.createTableIfNotExists('users', (table) => {
  table.increments();
  table.string('name');
  table.string('email');
  table.string('googleId');
}).then(() => {});

function Users() {
  return knex('users');
}

function findUserByGoogleId(googleId) {
  return Users().where({googleId}).first();
}

function findOrCreate(user, cb) {
  findUserByGoogleId(user.googleId).then(resp => {
    if (resp)
      cb(null, resp);
    else
      Users().insert(user)
             .then(ids => {
               cb(null, Object.assign({id: ids[0]}, user));
             });
    return null;
  }).catch((err) => cb(err, null));
}

app.use(session({
  store: new RedisStore(conf.REDIS_CONFIG),
  secret: conf.COOKIE_SECRET,
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 1 month
}));

app.use(favicon(__dirname + '/static/favicon.ico'))
app.use(bodyParser.json());
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: conf.GOOGLE_CLIENT_ID,
    clientSecret: conf.GOOGLE_CLIENT_SECRET,
    callbackURL: conf.GOOGLE_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, cb) {
    findOrCreate({
      googleId: profile.id,
      name: profile.displayName,
      email: profile.emails[0].value
    }, cb);
  }
));

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  Users().where('id', '=', id).first()
         .then(user => done(null, user))
         .catch(err => done(err, null));
});

app.get('/auth/google',
  passport.authenticate('google', {scope: ['profile', 'email']})
);

app.get('/auth/google/callback',
  passport.authenticate('google', {
    successRedirect: '/#/datasets',
    failureRedirect: '/#/help'
}));

app.get('/logout', function(req, res, next) {
  req.logout();
  next();
});

var router = express.Router();

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
  if (!req.user) {
    res.sendStatus(403);
    return;
  }

  var payload = {
    'iss': 'METASPACE2020',
    'sub': req.user.id,
    'name': req.user.name,
    'email': req.user.email,
    'exp': Math.floor(Date.now() / 1000 + 60),
    'role': getRole(req.user.email)
  }
  res.send(jwt.encode(payload, conf.JWT_SECRET));
});

router.get('/', (req, res, next) =>
  res.sendFile(__dirname + '/index.html'));

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

  app.set('views', __dirname);
  app.engine('html', require('ejs').renderFile);
  app.set('view engine', 'html');

} else {
  var compression = require('compression');
  app.use(compression());
  app.use('/dist', express.static('dist'));
}

app.use(router);
app.use('/upload', fineUploaderMiddleware());

app.listen(conf.PORT, () => {
  console.log(`listening on ${conf.PORT} port`);
})
