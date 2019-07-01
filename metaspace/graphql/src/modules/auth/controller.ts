import {Express, IRouter, NextFunction, Request, Response, Router} from 'express';
import {callbackify} from 'util';
import * as Passport from 'passport';
import {Strategy as LocalStrategy} from 'passport-local';
import {Strategy as GoogleStrategy} from 'passport-google-oauth20';
import * as JwtSimple from 'jwt-simple';
import {EntityManager} from 'typeorm';

import config from '../../utils/config';
import {User} from '../user/model';
import {
  createUserCredentials,
  findUserByEmail,
  findUserByGoogleId,
  findUserById,
  initOperation,
  resetPassword,
  sendResetPasswordToken,
  validateResetPasswordToken,
  verifyEmail,
  verifyPassword,
} from './operation';
import {getUserFromRequest, middleware} from './middleware';

const preventCache = (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};

const configurePassport = (router: IRouter<any>) => {
  middleware.forEach(m => { router.use(m); });

  Passport.serializeUser<User, string>(callbackify( async (user: User) => user.id));

  Passport.deserializeUser<User | false, string>(callbackify(async (id: string) => {
    return await findUserById(id, false, true) || false;
  }));

  router.post('/signout', preventCache, (req, res) => {
    req.logout();
    res.send('OK');
  });
  router.get('/signout', preventCache, (req, res) => {
    req.logout();
    res.redirect('/');
  });
};

export interface JwtUser {
  id?: string,
  email?: string,
  groupIds?: string[], // used in esConnector for ES visibility filters
  role: 'admin' | 'user' | 'anonymous',
}

export interface JwtPayload {
  iss: string,
  user?: JwtUser,
  sub?: string,
  iat?: number,
  exp?: number
}

const configureJwt = (router: IRouter<any>) => {
  function mintJWT(user: User | null, expSeconds: number | null = 60) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    let payload;
    if (user) {
      const {id, email, role, groups} = user;
      payload = {
        iss: 'METASPACE2020',
        user: {
          id, email, role,
          groupIds: groups ? groups.map(g => g.groupId) : null
        },
        iat: nowSeconds,
        exp: expSeconds == null ? undefined : nowSeconds + expSeconds,
      };
    } else {
      payload = {
        iss: 'METASPACE2020',
        user: {
          role: 'anonymous',
        }
      };
    }
    return JwtSimple.encode(payload as JwtPayload, config.jwt.secret, config.jwt.algorithm);
  }

  // Gives a one-time token, which expires in 60 seconds.
  // (this allows small time discrepancy between different servers)
  // If we want to use longer lifetimes we need to setup HTTPS on all servers.
  router.get('/gettoken', preventCache, async (req, res, next) => {
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

  router.get('/getapitoken', async (req, res, next) => {
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

const configureLocalAuth = (router: IRouter<any>) => {
  Passport.use(new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    callbackify(async (username: string, password: string) => {
      const user = await findUserByEmail(username);
      return user && await verifyPassword(password, user.credentials.hash) ? user : false;
    })
  ));

  router.post('/signin', function(req, res, next) {
    Passport.authenticate('local', function(err, user, info) {
      if (err) {
        next(err);
      } else if (user) {
        req.login(user, err => {
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

const configureGoogleAuth = (router: IRouter<any>) => {
  if (config.google.client_id) {
    Passport.use(new GoogleStrategy(
      {
        clientID: config.google.client_id,
        clientSecret: config.google.client_secret,
        callbackURL: config.google.callback_url,
      },
      callbackify(async (accessToken: string, refreshToken: string, profile: any) => {
        let user = await findUserByGoogleId(profile.id)
          || await findUserByEmail(profile.emails[0].value);
        if (!user) {
          await createUserCredentials({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
          });
          user = await findUserByGoogleId(profile.id);
        }
        return user;
      })
    ));

    router.get('/google', Passport.authenticate('google', {
      scope: ['profile', 'email']
    }));

    router.get('/google/callback', Passport.authenticate('google', {
      successRedirect: '/account/sign-in-success',
      failureRedirect: '/account/sign-in',
    }));
  }
};

const configureImpersonation = (router: IRouter<any>) => {
  if (config.features.impersonation) {
    router.get('/impersonate', preventCache, async (req, res, next) => {
      try {
        const currentUser = getUserFromRequest(req);
        if (currentUser == null || currentUser.role !== 'admin') {
          return res.status(403).send('Unauthenticated');
        }

        let user: User | null = null;
        const {email, id} = req.query;
        if (email) {
          user = await findUserByEmail(email) || await findUserByEmail(email, 'not_verified_email');
        } else if (id) {
          user = await findUserById(id);
        } else {
          return res.status(400).send( 'No id or email supplied');
        }

        if (!user) {
          return res.status(404).send(`User ${email || id} not found`);
        } else {
          return req.login(user, err => {
            if (err) {
              return next(err);
            } else {
              return res.redirect('/');
            }
          });
        }
      } catch (err) {
        return next(err);
      }
    })
  }
};

const configureCreateAccount = (router: IRouter<any>) => {
  router.post('/createaccount', async (req, res, next) => {
    try {
      const { name, email, password } = req.body;
      await createUserCredentials({ name, email, password });
      res.send(true);
    } catch (err) {
      next(err);
    }
  });

  router.get('/verifyemail', preventCache, async (req, res, next) => {
    const {email, token} = req.query;
    const user = await verifyEmail(email, token);
    if (user) {
      req.login(user, (err) => {
        if (err) {
          next(err);
        } else {
          res.cookie('flashMessage', JSON.stringify({type: 'verify_email_success'}), {maxAge: 10*60*1000});
          res.redirect('/');
        }
      });
    } else {
      res.cookie('flashMessage', JSON.stringify({type: 'verify_email_failure'}), {maxAge: 10*60*1000});
      res.redirect('/');
    }
  });
};

const configureResetPassword = (router: IRouter<any>) => {
  router.post('/sendpasswordresettoken', async (req, res, next) => {
    try {
      const { email } = req.body;
      await sendResetPasswordToken(email);
      res.send(true);
    } catch (err) {
      next(err);
    }
  });

  router.post('/validatepasswordresettoken', async (req, res, next) => {
    try {
      const { email, token } = req.body;
      if (await validateResetPasswordToken(email, token)) {
        res.send(true);
      } else {
        res.sendStatus(400);
      }
    } catch (err) {
      next(err);
    }
  });

  router.post('/resetpassword', async (req, res, next) => {
    try {
      const { email, token, password } = req.body;
      const user = await resetPassword(email, password, token);
      if (user) {
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

export const configureAuth = async (app: Express, entityManager: EntityManager) => {
  const router = Router();
  await initOperation(entityManager);
  configurePassport(router);
  configureJwt(router);
  configureLocalAuth(router);
  configureGoogleAuth(router);
  configureImpersonation(router);
  // TODO: find a parameter validation middleware
  configureCreateAccount(router);
  configureResetPassword(router);
  app.use('/api_auth', router);
};
