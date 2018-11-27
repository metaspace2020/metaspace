import * as Passport from 'passport';
import {Request, Response} from 'express';
import {User} from '../user/model';


export const middleware = [
  Passport.initialize({
    userProperty: 'cookieUser' // req.user is already used by the JWT
  }),
  Passport.session(),
];

export const getUserFromRequest = (req: Request): User | null => {
  const user = (req as any).cookieUser;
  return user ? user as User : null;
};

/** Runs the passport middleware against a live request. This is pretty hacky, but should be reliable enough.
 * Useful for doing authentication-related actions, like logging out, inside a GraphQL resolver.
 */
export const patchPassportIntoLiveRequest = (req: Request, res: Response): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const queue = middleware.slice();
      function executeMiddleware () {
        if (queue.length > 0) {
          try {
            const m = queue.shift();
            (m as any)(req, res, (err: any) => {
              if (err instanceof Error) {
                reject(err);
              } else {
                executeMiddleware();
              }
            });
          } catch (err) {
            reject(err);
          }
        } else {
          resolve();
        }
      }
      executeMiddleware();
    } catch (err) {
      return reject(err);
    }
  });
};
