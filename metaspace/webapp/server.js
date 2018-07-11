const AWS = require('aws-sdk'),
      express = require('express'),
      webpack = require('webpack'),
      passport = require('passport'),
      passwordless = require('passwordless'),
      bodyParser = require('body-parser'),
      favicon = require('serve-favicon'),
      session = require('express-session'),
      GoogleStrategy = require('passport-google-oauth20').Strategy,
      Raven = require('raven');

const env = process.env.NODE_ENV || 'development';
const conf = require('./conf.js');

const configureSession = (app) => {
  let sessionStore = undefined;
  if (conf.REDIS_CONFIG) {
    const RedisStore = require('connect-redis')(session);
    sessionStore = new RedisStore(conf.REDIS_CONFIG);
  }

  app.use(session({
    store: sessionStore,
    secret: conf.COOKIE_SECRET,
    resave: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 1 month
  }));
};

const configureKnex = () => {
  const knex = require('knex')({
    // FIXME: this is a temporary solution, use Postgres in the future
    client: 'sqlite3',
    connection: {
      filename: './db.sqlite',
    },
    useNullAsDefault: true,
  });

  knex.schema.createTableIfNotExists('users', (table) => {
    table.increments();
    table.string('name');
    table.string('email');
    table.string('googleId');
  }).then(() => {});

  return knex;
};

const configureGoogleAuth = (app, knex) => {
  if (conf.GOOGLE_CLIENT_ID) {
    app.use(passport.initialize());
    app.use(passport.session());

    const findOrCreate = async (user) => {
      const foundUser = await knex('users').where({ googleId: user.googleId }).first();
      if (foundUser) {
        return foundUser;
      } else {
        const ids = await knex('users').insert(user);
        return { id: ids[0], ...user };
      }
    };

    passport.use(new GoogleStrategy({
        clientID: conf.GOOGLE_CLIENT_ID,
        clientSecret: conf.GOOGLE_CLIENT_SECRET,
        callbackURL: conf.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, cb) => {
        try {
          const user = await findOrCreate({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
          });
          cb(null, user);
        } catch (err) {
          cb(err);
        }
      }
    ));

    passport.serializeUser(function (user, done) {
      done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
      try {
        const user = await knex('users').where('id', '=', id).first();
        done(null, user);
      } catch (err) {
        console.log(err);
        done(null, false);
      }
    });

    app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

    app.get('/auth/google/callback',
      passport.authenticate('google', {
        successRedirect: '/#/datasets',
        failureRedirect: '/#/help',
      }))
  }
};

const configurePasswordlessAuth = (app, knex) => {
  if (conf.REDIS_CONFIG) {
    const plRedisStore = require('passwordless-redisstore-bcryptjs');
    passwordless.init(new plRedisStore(conf.REDIS_CONFIG.port, conf.REDIS_CONFIG.host));
  } else {
    const plMemoryStore = require('passwordless-memorystore');
    passwordless.init(new plMemoryStore());
  }

  function loginLink(token, uid) {
    return `http://${conf.HOST_NAME}/?token=${token}&uid=${encodeURIComponent(uid)}`;
  }

  if (conf.AWS_ACCESS_KEY_ID && env !== 'development') {
    // in staging/production we deliver the login link by email, using AWS SES

    AWS.config.update({
      accessKeyId: conf.AWS_ACCESS_KEY_ID,
      secretAccessKey: conf.AWS_SECRET_ACCESS_KEY,
      region: conf.AWS_REGION
    });

    const ses = new AWS.SES();

    passwordless.addDelivery((token, uid, recipient, callback, req) => {
      const text = 'Greetings!\n'
        + `Visit this link to sign in: ${loginLink(token, uid)}\n\n`
        + 'Best regards,\n'
        + 'METASPACE Team';

      ses.sendEmail({
        Source: 'contact@metaspace2020.eu',
        Destination: { ToAddresses: [recipient] },
        Message: {
          Subject: { Data: 'METASPACE login link' },
          Body: { Text: { Data: text } }
        }
      }, (err, data) => {
        if (err) console.error(err);
        callback(err);
      });
    });
  }

  if (env === 'development') {
    passwordless.addDelivery((token, uid, recipient, callback) => {
      console.log(`Login link for ${recipient}: ${loginLink(token, uid)}`);
      callback(null);
    });
  }

  app.use(passwordless.sessionSupport());
  app.use(passwordless.acceptToken({ successRedirect: '/' }));

  app.get('/sendToken/',
    passwordless.requestToken((user, delivery, callback, req) => {
      knex('users').where({ email: user }).first()
                   .then(record => {
                     if (record) {
                       callback(null, record.id);
                     } else {
                       knex('users').insert({ email: user, name: '', googleId: null }).then(() => {
                         knex('users').where({ email: user }).first()
                                      .then(record => callback(null, record.id));
                       });
                     }
                   })
    }, { allowGet: true }),
    (req, res) => {
      res.send('OK');
    });
};

const configureJwtMinting = (app, knex) => {
  const jwt = require('jwt-simple');

  function mintJWT(user, expSeconds=60) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = {
      'iss': 'METASPACE2020',
      'sub': user.id,
      'name': user.name,
      'email': user.email,
      'iat': nowSeconds,
      'exp': expSeconds == null ? undefined : nowSeconds + expSeconds,
      'role': conf.ADMIN_EMAILS.includes(user.email) ? 'admin' : 'user',
    };
    return jwt.encode(payload, conf.JWT_SECRET);
  }
  // Gives a one-time token, which expires in 60 seconds.
  // (this allows small time discrepancy between different servers)
  // If we want to use longer lifetimes we need to setup HTTPS on all servers.
  app.get('/getToken', (req, res, next) => {

    // Ensure browsers don't cache JWTs
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // basic support for local installations: no authentication, everyone is admin
    if (!req.user && conf.AUTO_LOGIN_AS_ADMIN) {
      res.send(jwt.encode({
        'iss': 'METASPACE2020',
        'role': 'admin',
        'exp': Math.floor(Date.now() / 1000 + 60),
        'email': 'admin@localhost',
      }, conf.JWT_SECRET));
      return;
    }

    if (!req.user) {
      res.send(jwt.encode({
        'iss': 'METASPACE2020',
        'role': 'anonymous',
      }, conf.JWT_SECRET));
      return;
    }

    if (typeof req.user === 'string') {
      // FIXME: refactor into a middleware
      knex('users').where('id', '=', req.user).first().then(user => {
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
};

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
  const knex = configureKnex();

  configureRavenRequestHandler(app);
  configureSession(app);

  app.use(favicon(__dirname + '/static/favicon.ico'));
  app.use(bodyParser.json());

  configureGoogleAuth(app, knex);
  configurePasswordlessAuth(app, knex);

  app.get('/logout', passwordless.logout(),
    function (req, res, next) {
      req.logout();
      res.send('OK');
    });

  configureJwtMinting(app, knex);
  configureAppServer(app);
  configureUploadHandler(app);
  configureRavenErrorHandler(app);

  app.listen(conf.PORT, () => {
    console.log(`listening on ${conf.PORT} port`);
  });
};

startServer();
