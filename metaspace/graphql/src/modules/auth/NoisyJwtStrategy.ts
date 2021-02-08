
import { Strategy as JwtStrategy, StrategyOptions } from 'passport-jwt'
import { Request } from 'express'

/**
 * Wrapper for JwtStrategy that changes JWT-related errors from authentication failures into authentication errors.
 * Without this, invalid JWTs are effectively ignored, which makes debugging a lot harder
 */
export default class NoisyJwtStrategy extends JwtStrategy {
  authenticate(req: Request, options: StrategyOptions) {
    const oldFail = this.fail
    this.fail = function(challenge: any, status?: number) {
      const reason = challenge instanceof Error ? challenge.message : challenge

      if (reason && typeof reason !== 'number' && reason !== 'No auth token') {
        return this.error(challenge)
      } else {
        return (oldFail as any).call(this, challenge, status)
      }
    }

    return super.authenticate(req, options)
  }
}
