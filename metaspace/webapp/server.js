var AWS = require('aws-sdk'),
    express = require('express'),
    webpack = require('webpack'),
    passport = require('passport'),
    passwordless = require('passwordless'),
    bodyParser = require('body-parser'),
    favicon = require('serve-favicon'),
    session = require('express-session'),
    GoogleStrategy = require('passport-google-oauth20').Strategy,
    Raven = require('raven');

var env = process.env.NODE_ENV || 'development';
var conf = require('./conf.js');

const LOCAL_SETUP = conf.UPLOAD_DESTINATION != 's3';

var app = express();

if (env !== 'development' && conf.RAVEN_DSN != null) {
  Raven.config(conf.RAVEN_DSN).install();
  // Raven.requestHandler should be the first middleware
  app.use(Raven.requestHandler());
}

var jwt = require('jwt-simple');
let sessionStore = undefined;
if (conf.REDIS_CONFIG) {
  var RedisStore = require('connect-redis')(session);
  sessionStore = new RedisStore(conf.REDIS_CONFIG);
}

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

app.use(session({
  store: sessionStore,
  secret: conf.COOKIE_SECRET,
  resave: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 1 month
}));

app.use(favicon(__dirname + '/static/favicon.ico'))
app.use(bodyParser.json());

if (conf.GOOGLE_CLIENT_ID) {
  app.use(passport.initialize());
  app.use(passport.session());

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
           .catch(err => {
             console.log(err);
             done(null, false);
           });
  });

  app.get('/auth/google',
    passport.authenticate('google', {scope: ['profile', 'email']})
  );

  app.get('/auth/google/callback',
    passport.authenticate('google', {
      successRedirect: '/#/datasets',
      failureRedirect: '/#/help'
  }));
}

if(conf.REDIS_CONFIG) {
  const plRedisStore = require('passwordless-redisstore-bcryptjs');
  passwordless.init(new plRedisStore(conf.REDIS_CONFIG.port, conf.REDIS_CONFIG.host));
} else {
  const plMemoryStore = require('passwordless-memorystore');
  passwordless.init(new plMemoryStore());
}

function loginLink(token, uid) {
  return `http://${conf.HOST_NAME}/?token=${token}&uid=${encodeURIComponent(uid)}`;
}

if (conf.AWS_ACCESS_KEY_ID && env != 'development') {
  // in staging/production we deliver the login link by email, using AWS SES

  AWS.config.update({
    accessKeyId: conf.AWS_ACCESS_KEY_ID,
    secretAccessKey: conf.AWS_SECRET_ACCESS_KEY,
    region: conf.AWS_REGION
  });

  var ses = new AWS.SES();

  passwordless.addDelivery((token, uid, recipient, callback, req) => {
    const text = 'Greetings!\n'
    + `Visit this link to sign in: ${loginLink(token, uid)}\n\n`
    + 'Best regards,\n'
    + 'METASPACE Team\n\n'
    + '---\n'
    + 'The online annotation engine is being developed as part of the METASPACE Horizon2020 project (grant number: 634402).';

    ses.sendEmail({
      Source: 'contact@metaspace2020.eu',
      Destination: { ToAddresses: [recipient] },
      Message: {
        Subject: {Data: 'METASPACE login link'},
        Body: {Text: {Data: text}}
      }
    }, (err, data) => {
      if (err) console.error(err);
      callback(err);
    });
  });
}

if (env == 'development') {

  passwordless.addDelivery((token, uid, recipient, callback) => {
    console.log(`Login link for ${recipient}: ${loginLink(token, uid)}`);
    callback(null);
  });

  // expose the link to outside to enable testing even when the webapp is inside virtualbox/docker
  app.get('/getLoginLink/:email', function (req, res) {
    redis.get(req.params.email)
         .then(link => res.send(link))
         .catch((e) => { res.status(400); });
  });
}

app.use(passwordless.sessionSupport());
app.use(passwordless.acceptToken({ successRedirect: '/'}));

app.get('/sendToken/',
  passwordless.requestToken((user, delivery, callback, req) => {
    Users().where({email: user}).first()
           .then(record => {
             if (record) {
               callback(null, record.id);
             } else {
               Users().insert({email: user, name: '', googleId: null}).then(() => {
                 Users().where({email: user}).first()
                        .then(record => callback(null, record.id));
               });
             }
           })
  }, {allowGet: true}),
  (req, res) => {
    res.send('OK');
  });
app.get('/logout', passwordless.logout(),
        function(req, res, next) {
          req.logout();
          res.send('OK');
        });

var router = express.Router();

function getRole(email) {
  if (conf.ADMIN_EMAILS.indexOf(email) != -1)
    return 'admin';
  else
    return 'user';
}

function mintJWT(user, expSeconds=60) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    'iss': 'METASPACE2020',
    'sub': user.id,
    'name': user.name,
    'email': user.email,
    'iat': nowSeconds,
    'exp': expSeconds == null ? undefined : nowSeconds + expSeconds,
    'role': getRole(user.email)
  };
  return jwt.encode(payload, conf.JWT_SECRET);
}
// Gives a one-time token, which expires in 60 seconds.
// (this allows small time discrepancy between different servers)
// If we want to use longer lifetimes we need to setup HTTPS on all servers.
router.get('/getToken', (req, res, next) => {

  // basic support for local installations: no authentication, everyone is admin
  if (!req.user && LOCAL_SETUP) {
    res.send(jwt.encode({
      'iss': 'METASPACE2020',
      'role': 'admin',
      'exp': Math.floor(Date.now() / 1000 + 60),
      'email': 'admin@localhost'
    }, conf.JWT_SECRET));
    return;
  }

  if (!req.user) {
    res.send(jwt.encode({
      'iss': 'METASPACE2020',
      'role': 'anonymous'
    }, conf.JWT_SECRET));
    return;
  }

  if (typeof req.user === 'string') {
    // FIXME: refactor into a middleware
    Users().where('id', '=', req.user).first().then(user => {
      res.send(mintJWT(user));
    }).catch(err => res.sendStatus(403));
  } else {
    res.send(mintJWT(req.user));
  }
});

app.get('/getApiToken', async (req, res, next) => {
  try {
    const user = req.user != null && await knex('users').where('id', req.user).first();
    if (user) {
      const jwt = mintJWT(user, null);
      res.send(`Your API token is: ${jwt}`);
    } else {
      res.status(401).send("Please log in before accessing this page");
    }
  } catch (err) {
    next(err);
  }
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
    noInfo: true,
    stats: {
      chunks: false,
      chunkModules: false,
      colors: true
    }
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

if (conf.UPLOAD_DESTINATION == 's3') {
  app.use('/upload', require('./fineUploaderS3Middleware.js')());
} else {
  app.use('/upload', require('./fineUploaderLocalMiddleware.js')());
}

if (env !== 'development' && conf.RAVEN_DSN != null) {
  // Raven.errorHandler should go after all normal handlers/middleware, but before any other error handlers
  app.use(Raven.errorHandler());
}

app.listen(conf.PORT, () => {
  console.log(`listening on ${conf.PORT} port`);
})
