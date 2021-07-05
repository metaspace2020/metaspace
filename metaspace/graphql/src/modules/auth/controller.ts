import { Express, IRouter, NextFunction, Request, Response, Router } from 'express'
import { callbackify } from 'util'
import * as Passport from 'passport'
import { Strategy as LocalStrategy } from 'passport-local'
import { ExtractJwt } from 'passport-jwt'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { HeaderAPIKeyStrategy } from 'passport-headerapikey'

import * as jsonwebtoken from 'jsonwebtoken'
import * as superstruct from 'superstruct'
import * as uuid from 'uuid'
import { EntityManager } from 'typeorm'
import 'express-session'

import config from '../../utils/config'
import { User } from '../user/model'
import { Project } from '../project/model'
import {
  createUserCredentials, findUserByApiKey,
  findUserByEmail,
  findUserByGoogleId,
  findUserById,
  initOperation,
  resetPassword,
  sendResetPasswordToken, signout,
  validateResetPasswordToken,
  verifyEmail,
  verifyPassword,
} from './operation'
import { AuthMethodOptions } from '../../context'
import { UserError } from 'graphql-errors'
import NoisyJwtStrategy from './NoisyJwtStrategy'

const Uuid = superstruct.define<string>('Uuid', value => typeof value === 'string' && uuid.validate(value))

const preventCache = (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  next()
}

export const getUserFromRequest = (req: Request): User | null => {
  const user = (req as any).user
  return user ? user as User : null
}

const configurePassport = (router: IRouter<any>, app: Express) => {
  app.use(Passport.initialize())
  // GraphQL endpoint can use any authentication method, but precedence is given to JWT/API Key as they're usually
  // explicitly provided and should override any session-based authentication
  app.use('/graphql', Passport.authenticate(['jwt', 'headerapikey', 'session', 'anonymous'], { session: false }))
  // /api_auth endpoints only use session-based authentication (i.e. local/google), to prevent JWT/API keys from being
  // able to be used for resetting passwords, generating new JWTs, etc.
  router.use(Passport.session())

  // eslint-disable-next-line @typescript-eslint/require-await
  Passport.serializeUser<User, string>(callbackify(async(user: User) => user.id))

  Passport.deserializeUser<User | false, string>(callbackify(async(id: string) => {
    return await findUserById(id, false, false) || false
  }))

  router.post('/signout', preventCache, async(req, res) => {
    await signout(req)
    res.send('OK')
  })
  router.get('/signout', preventCache, async(req, res) => {
    await signout(req)
    res.redirect('/')
  })
}

export interface JwtUser {
  id?: string,
  email?: string,
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
    const nowSeconds = Math.floor(Date.now() / 1000)
    let payload
    if (user) {
      const { id, email, role } = user
      payload = {
        iss: 'METASPACE2020',
        user: {
          id,
          email,
          role,
        },
        iat: nowSeconds,
        exp: expSeconds == null ? undefined : nowSeconds + expSeconds,
      }
    } else {
      payload = {
        iss: 'METASPACE2020',
        user: {
          role: 'anonymous',
        },
      }
    }
    return jsonwebtoken.sign(payload as JwtPayload, config.jwt.secret, { algorithm: config.jwt.algorithm })
  }

  Passport.use(new NoisyJwtStrategy({
    secretOrKey: config.jwt.secret,
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    algorithms: [config.jwt.algorithm],
  }, (jwtPayload: JwtPayload, done: any) => {
    try {
      if (jwtPayload.user && jwtPayload.user.id) {
        done(null, jwtPayload.user, AuthMethodOptions.JWT)
      } else {
        done(null, false)
      }
    } catch (err) {
      done(err)
    }
  }))

  // Gives a one-time token, which expires in 60 seconds.
  // (this allows small time discrepancy between different servers)
  // If we want to use longer lifetimes we need to setup HTTPS on all servers.
  // eslint-disable-next-line @typescript-eslint/require-await
  router.get('/gettoken', preventCache, async(req, res, next) => {
    try {
      const user = getUserFromRequest(req)
      if (user) {
        res.send(mintJWT(user))
      } else {
        res.send(mintJWT(null))
      }
    } catch (err) {
      next(err)
    }
  })
}

const configureApiKey = () => {
  const prefix = /^Api-Key /i
  Passport.use(new HeaderAPIKeyStrategy(
    // Handling prefix manually because HeaderAPIKeyStrategy raises an error when a different prefix is used
    { header: 'Authorization', prefix: '' },
    false,
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async(header, done) => {
      try {
        if (prefix.test(header)) {
          const apikey = header.replace(prefix, '')
          const user = await findUserByApiKey(apikey, false)
          if (user != null) {
            return done(null, user, AuthMethodOptions.API_KEY)
          }
          // WORKAROUND: Passport doesn't differentiate between unspecified and invalid authentication details,
          // so following the recommended pattern of "return done(null, false)" will continue down the strategy chain
          // until "anonymous" successfully authenticates the user. Throwing an error seems to be the only way to give
          // correct feedback.
          const error = new UserError('Invalid API key');
          (error as any).status = 401
          throw error
        } else {
          return done(null, false)
        }
      } catch (err) {
        return done(err)
      }
    }
  ))
}

const configureLocalAuth = (router: IRouter<any>) => {
  Passport.use(new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async(username: string, password: string, done: any) => {
      try {
        const user = await findUserByEmail(username)
        if (user && await verifyPassword(password, user.credentials.hash)) {
          done(null, user, AuthMethodOptions.SESSION)
        } else {
          done(null, false)
        }
      } catch (err) {
        done(err)
      }
    }
  ))

  router.post('/signin', function(req, res, next) {
    Passport.authenticate('local', function(err, user) {
      if (err) {
        next(err)
      } else if (user) {
        req.login(user, err => {
          if (err) {
            next()
          } else {
            res.status(200).send()
          }
        })
      } else {
        res.status(401).send()
      }
    })(req, res, next)
  })
}

const configureReviewerAuth = (router: IRouter<any>, entityManager: EntityManager) => {
  const ReviewQuery = superstruct.type({
    prj: Uuid,
    token: superstruct.string(),
  })

  router.get('/review', async(req, res, next) => {
    try {
      const session = req.session
      const { prj: projectId, token } = ReviewQuery.mask(req.query)
      if (session && projectId && token) {
        const project = await entityManager.getRepository(Project).findOne({ id: projectId })
        if (project) {
          if (project.reviewToken == null || project.reviewToken !== token) {
            res.status(401).send()
          } else {
            if (!session.reviewTokens) {
              session.reviewTokens = [token]
            } else if (!session.reviewTokens.includes(token)) {
              session.reviewTokens.push(token)
            }
            res.cookie('flashMessage', JSON.stringify({ type: 'review_token_success' }),
              { maxAge: 10 * 60 * 1000 })
            res.redirect(`/project/${projectId}`)
          }
        } else {
          res.status(404).send()
        }
      } else {
        res.status(404).send()
      }
    } catch (err) {
      next(err)
    }
  })
}

const configureGoogleAuth = (router: IRouter<any>) => {
  if (config.google.client_id) {
    Passport.use(new GoogleStrategy(
      {
        clientID: config.google.client_id,
        clientSecret: config.google.client_secret,
        callbackURL: config.google.callback_url,
      },
      async(accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          let user = await findUserByGoogleId(profile.id)
            || await findUserByEmail(profile.emails[0].value)
          if (!user) {
            await createUserCredentials({
              googleId: profile.id,
              name: profile.displayName,
              email: profile.emails[0].value,
            })
            user = await findUserByGoogleId(profile.id)
          }
          if (user) {
            done(null, user, AuthMethodOptions.SESSION)
          } else {
            done(null, false)
          }
          return user
        } catch (err) {
          done(err)
        }
      }
    ))

    router.get('/google', Passport.authenticate('google', {
      prompt: 'select_account',
      scope: ['profile', 'email'],
    }))

    router.get('/google/callback', Passport.authenticate('google', {
      successRedirect: '/account/sign-in-success',
      failureRedirect: '/account/sign-in',
    }))
  }
}

const configureImpersonation = (router: IRouter<any>) => {
  const ImpersonationQuery = superstruct.type({
    email: superstruct.optional(superstruct.string()),
    id: superstruct.optional(superstruct.string()),
  })
  if (config.features.impersonation) {
    router.get('/impersonate', preventCache, async(req, res, next) => {
      try {
        const { email, id } = ImpersonationQuery.mask(req.query)
        const currentUser = getUserFromRequest(req)
        if (currentUser == null || currentUser.role !== 'admin') {
          return res.status(403).send('Unauthenticated')
        }

        let user: User | null = null
        if (email) {
          user = await findUserByEmail(email) || await findUserByEmail(email, 'not_verified_email')
        } else if (id) {
          user = await findUserById(id)
        } else {
          return res.status(400).send('No id or email supplied')
        }

        if (!user) {
          return res.status(404).send(`User ${email || id} not found`)
        } else {
          return req.login(user, err => {
            if (err) {
              return next(err)
            } else {
              return res.redirect('/')
            }
          })
        }
      } catch (err) {
        return next(err)
      }
    })
  }
}

const configureCreateAccount = (router: IRouter<any>) => {
  const CreateAccountBody = superstruct.type({
    name: superstruct.string(),
    email: superstruct.string(),
    password: superstruct.string(),
  })
  router.post('/createaccount', async(req, res, next) => {
    try {
      const { name, email, password } = CreateAccountBody.mask(req.body)
      await createUserCredentials({ name, email, password })
      res.send(true)
    } catch (err) {
      next(err)
    }
  })

  const VerifyEmailQuery = superstruct.object({
    email: superstruct.string(),
    token: superstruct.string(),
  })
  router.get('/verifyemail', preventCache, async(req, res, next) => {
    try {
      const { email, token } = VerifyEmailQuery.mask(req.query)
      const user = await verifyEmail(email, token)
      if (user) {
        req.login(user, (err) => {
          if (err) {
            next(err)
          } else {
            res.cookie('flashMessage', JSON.stringify({ type: 'verify_email_success' }), { maxAge: 10 * 60 * 1000 })
            res.redirect('/')
          }
        })
      } else {
        res.cookie('flashMessage', JSON.stringify({ type: 'verify_email_failure' }), { maxAge: 10 * 60 * 1000 })
        res.redirect('/')
      }
    } catch (err) {
      next(err)
    }
  })
}

const configureResetPassword = (router: IRouter<any>) => {
  const SendPasswordResetTokenBody = superstruct.object({
    email: superstruct.string(),
  })
  router.post('/sendpasswordresettoken', async(req, res, next) => {
    try {
      const { email } = SendPasswordResetTokenBody.mask(req.body)
      await sendResetPasswordToken(email)
      res.send(true)
    } catch (err) {
      next(err)
    }
  })

  const ValidatePasswordResetTokenBody = superstruct.object({
    email: superstruct.string(),
    token: superstruct.string(),
  })
  router.post('/validatepasswordresettoken', async(req, res, next) => {
    try {
      const { email, token } = ValidatePasswordResetTokenBody.mask(req.body)
      if (await validateResetPasswordToken(email, token)) {
        res.send(true)
      } else {
        res.sendStatus(400)
      }
    } catch (err) {
      next(err)
    }
  })

  const ResetPasswordBody = superstruct.object({
    email: superstruct.string(),
    token: superstruct.string(),
    password: superstruct.string(),
  })
  router.post('/resetpassword', async(req, res, next) => {
    try {
      const { email, token, password } = ResetPasswordBody.mask(req.body)
      const user = await resetPassword(email, password, token)
      if (user) {
        req.login(user, (err) => {
          if (err) {
            next(err)
          } else {
            res.send(true)
          }
        })
      } else {
        res.sendStatus(400)
      }
    } catch (err) {
      next(err)
    }
  })
}

export const configureAuth = async(app: Express, entityManager: EntityManager) => {
  const router = Router()
  await initOperation(entityManager)
  configurePassport(router, app)
  configureJwt(router)
  configureApiKey()
  configureLocalAuth(router)
  configureGoogleAuth(router)
  configureImpersonation(router)
  // TODO: find a parameter validation middleware
  configureCreateAccount(router)
  configureResetPassword(router)
  configureReviewerAuth(router, entityManager)
  app.use('/api_auth', router)
}
