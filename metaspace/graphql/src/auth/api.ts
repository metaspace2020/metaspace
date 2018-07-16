import { Express } from 'express';
import {callbackify} from 'util';
import * as Passport from 'passport';
import {Strategy as LocalStrategy} from 'passport-local';
import {Strategy as GoogleStrategy} from 'passport-google-oauth20';
import * as config from 'config';
import {
  createResetPasswordToken,
  createUser,
  DbUser,
  findUserByEmail,
  findUserByGoogleId,
  findUserById,
  setUserPassword,
} from './db';

const configurePassport = (app: Express) => {
  app.use(Passport.initialize());
  app.use(Passport.session());

  Passport.serializeUser<DbUser, string>(callbackify( async (user: DbUser) => user.id));

  Passport.deserializeUser<DbUser | false, string>(callbackify(async (id: string) => {
    return await findUserById(id) || false;
  }));

  app.post('/api_auth/signout', (req, res) => {
    req.logout();
    res.send('OK');
  });
};

const configureLocalAuth = (app: Express) => {
  Passport.use(new LocalStrategy(
    {
      usernameField: 'email',
    },
    callbackify(async (username: string, password: string) => {
      const user = await findUserByEmail(username);
      return user && user.password === password ? user : false;
    })
  ));

  app.post('/api_auth/signin', Passport.authenticate('local', {
    failureRedirect: '/#/account/sign-in',
  }))
};

const configureGoogleAuth = (app: Express) => {
  const conf = config as any;
  if (conf.GOOGLE_CLIENT_ID) {
    Passport.use(new GoogleStrategy(
      {
        clientID: conf.GOOGLE_CLIENT_ID,
        clientSecret: conf.GOOGLE_CLIENT_SECRET,
        callbackURL: conf.GOOGLE_CALLBACK_URL,
      },
      callbackify(async (accessToken: string, refreshToken: string, profile: any) => {
        return await findUserByGoogleId(profile.id)
          || await createUser({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
          });
      })
    ));

    app.get('/api_auth/google', Passport.authenticate('google', {
      scope: ['profile', 'email']
    }));

    app.get('/api_auth/google/callback', Passport.authenticate('google', {
      successRedirect: '/#/datasets',
      failureRedirect: '/#/account/sign-in',
    }));
  }
};

const configureCreateAccount = (app: Express) => {
  app.post('/api_auth/createaccount', async (req, res, next) => {
    try {
      const { name, email, password } = req.body;
      const user = await createUser({ name, email, password });
      res.send(true);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api_auth/verifyemail', async (req, res, next) => {
    const {email, token} = req.query;
    // TODO: Verify email
    const user = findUserByEmail(email);
    if (user) {
      req.login(user, (err) => {
        if (err) {
          next(err);
        } else {
          res.redirect('/#/');
        }
      });
    } else {
      res.sendStatus(401); //TODO: Redirect to a user-friendly error message
    }
  });
};

const configureResetPassword = (app: Express) => {
  app.post('/api_auth/sendpasswordresettoken', async (req, res, next) => {
    try {
      const { email } = req.body;
      const token = await createResetPasswordToken(email);
      console.log(`/#/account/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`);
      res.send(true);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api_auth/validatepasswordresettoken', async (req, res, next) => {
    try {
      const { email, token } = req.body;
      const user = await findUserByEmail(email);
      // TODO: token expiry, etc.
      if (user && user.resetPasswordToken === token) {
        res.send(true);
      } else {
        res.sendStatus(400);
      }
    } catch (err) {
      next(err);
    }
  });

  app.post('/api_auth/resetpassword', async (req, res, next) => {
    try {
      const { email, token, password } = req.body;
      let user = await findUserByEmail(email);
      // TODO: token expiry, etc.
      if (user && user.resetPasswordToken === token) {
        user = await setUserPassword(user.id, password);
        req.login(user, (err) => {
          if (err) {
            next(err);
          } else {
            res.send(true);
          }
        });
      } else {
        res.sendStatus(400);
      }
    } catch (err) {
      next(err);
    }
  });
};

export const configureAuth = (app: Express) => {
  configurePassport(app);
  configureLocalAuth(app);
  configureGoogleAuth(app);
  // TODO: find a parameter validation middleware
  configureCreateAccount(app);
  configureResetPassword(app);
};
