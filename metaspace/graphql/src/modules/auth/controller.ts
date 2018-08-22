import { Express, Request, Response, NextFunction } from 'express';
import * as Knex from 'knex'
import {callbackify} from 'util';
import * as Passport from 'passport';
import {Strategy as LocalStrategy} from 'passport-local';
import {Strategy as GoogleStrategy} from 'passport-google-oauth20';
import * as JwtSimple from 'jwt-simple';

import config from '../../utils/config';
import {findUserByEmail, findUserByGoogleId, findUserById} from '../user';
import {User} from '../user/model';
import {createConnection} from '../../utils';
import {
  sendResetPasswordToken,
  createUserCredentials,
  resetPassword,
  verifyEmail,
  verifyPassword,
  initOperation
} from './operation';

const getUserFromRequest = (req: Request): User | null => {
  const user = (req as any).cookieUser;
  return user ? user as User : null;
};

const preventCache = (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};

const configurePassport = (app: Express) => {
  app.use(Passport.initialize({
    userProperty: 'cookieUser' // req.user is already used by the JWT
  }));
  app.use(Passport.session());

  Passport.serializeUser<string, string>(callbackify( async (userId: string) => userId));

  Passport.deserializeUser<User | false, string>(callbackify(async (id: string) => {
    return await findUserById(id) || false;
  }));

  app.post('/api_auth/signout', preventCache, (req, res) => {
    req.logout();
    res.send('OK');
  });
  app.get('/api_auth/signout', preventCache, (req, res) => {
    req.logout();
    res.redirect('/');
  });
};

export interface JwtUser extends User {
  iss: string,
  sub?: string,
  iat?: number,
  exp?: number
}

const configureJwt = (app: Express) => {
  function mintJWT(user: User | null, expSeconds: number | null = 60) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    let payload;
    if (user != null) {
      payload = {
        'iss': 'METASPACE2020',
        'sub': user.id,
        'name': user.name,
        'email': user.email,
        'iat': nowSeconds,
        'exp': expSeconds == null ? undefined : nowSeconds + expSeconds,
        'role': user.role,
      };
    } else {
      payload = {
        'iss': 'METASPACE2020',
        'role': 'anonymous',
      };
    }
    return JwtSimple.encode(payload as JwtUser, config.jwt.secret);
  }

  // Gives a one-time token, which expires in 60 seconds.
  // (this allows small time discrepancy between different servers)
  // If we want to use longer lifetimes we need to setup HTTPS on all servers.
  app.get('/api_auth/gettoken', preventCache, async (req, res, next) => {
    try {
      const user = getUserFromRequest(req);
      if (user) {
        res.send(mintJWT(user));
      } else {
        res.send(mintJWT(null));
      }
    } catch (err) {
      next(err);
    }
  });

  app.get('/api_auth/getapitoken', async (req, res, next) => {
    try {
      const user = getUserFromRequest(req);
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

const configureLocalAuth = (app: Express) => {
  Passport.use(new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    callbackify(async (email: string, password: string) => {
      const user = await findUserByEmail(email);
      return user && await verifyPassword(password, user.credentials.hash) ? user : false;
    })
  ));

  app.post('/api_auth/signin', function(req, res, next) {
    Passport.authenticate('local', function(err, user, info) {
      if (err) {
        next(err);
      } else if (user) {
        req.logIn(user, err => {
          if (err) {
            next();
          } else {
            res.status(200).send();
          }
        });
      } else {
        res.status(401).send();
      }
    })(req, res, next);
  })
};

const configureGoogleAuth = (app: Express) => {
  if (config.google.client_id) {
    Passport.use(new GoogleStrategy(
      {
        clientID: config.google.client_id,
        clientSecret: config.google.client_secret,
        callbackURL: config.google.callback_url,
      },
      callbackify(async (accessToken: string, refreshToken: string, profile: any) => {
        return await findUserByGoogleId(profile.id)
          || await createUserCredentials({
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
      await createUserCredentials({ name, email, password });
      res.send(true);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api_auth/verifyemail', preventCache, async (req, res, next) => {
    const {email, token} = req.query;
    // TODO: Better handling for when the user
    const user = await verifyEmail(email, token);
    if (user) {
      req.login(user, (err) => {
        if (err) {
          next(err);
        } else {
          res.cookie('flashMessage', JSON.stringify({type: 'verify_email_success'}), {maxAge: 10*60*1000});
          res.redirect('/#/');
        }
      });
    } else {
      res.cookie('flashMessage', JSON.stringify({type: 'verify_email_failure'}), {maxAge: 10*60*1000});
      res.redirect('/#/');
    }
  });
};

const configureResetPassword = (app: Express) => {
  app.post('/api_auth/sendpasswordresettoken', async (req, res, next) => {
    try {
      const { email } = req.body;
      await sendResetPasswordToken(email);
      res.send(true);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api_auth/validatepasswordresettoken', async (req, res, next) => {
    try {
      const { email, token } = req.body;
      const user = await findUserByEmail(email);
      if (user && user.credentials.resetPasswordToken === token) {
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
      const userId = await resetPassword(email, password, token);
      if (userId != null) {
        req.login(userId, (err) => {
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

export const configureAuth = async (app: Express) => {
  await initOperation(await createConnection());
  configurePassport(app);
  configureJwt(app);
  configureLocalAuth(app);
  configureGoogleAuth(app);
  // TODO: find a parameter validation middleware
  configureCreateAccount(app);
  configureResetPassword(app);
};
