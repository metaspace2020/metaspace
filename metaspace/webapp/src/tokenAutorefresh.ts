import { getJWT, decodePayload, delay } from './util'

const REFRESH_INTERVAL = 30000; // 30 seconds

class TokenAutorefresh {
  jwt?: string;
  jwtPromise?: Promise<string>;
  jwtCanExpire: boolean = true;
  jwtListeners: ((jwt?: string, payload?: any) => void)[] = [];

  constructor() {
    this.runRefreshLoop();
  }

  async getJwt() {
    while (this.jwt == null && this.jwtPromise != null) {
      await this.jwtPromise;
    }
    return this.jwt;
  }

  async refreshJwt(invalidateOldJwt: boolean = false) {
    if (invalidateOldJwt) {
      this.jwt = undefined;
    }
    const promise = this.jwtPromise = getJWT();
    const jwt = await promise;

    // Only overwrite the jwt if another refresh hasn't started while this one has been waiting
    if (this.jwtPromise === promise) {
      this.jwt = jwt;
      this.jwtPromise = undefined;
      const payload = decodePayload(this.jwt);
      this.jwtCanExpire = payload.exp != null;
      this.jwtListeners.forEach(listener => listener(jwt, payload));
    }
    return await this.getJwt();
  }

  addJwtListener(listener: (jwt?: string, payload?: any) => void) {
    this.jwtListeners.push(listener);
  }

  private async runRefreshLoop() {
    let errors = 0;
    while (true) {
      try {
        if (!this.jwt || this.jwtCanExpire) {
          await this.refreshJwt();
          errors = 0;
        }
        await delay(REFRESH_INTERVAL);
      } catch (err) {
        // If there's an error, speed up the refresh cycle so that the user isn't left waiting too long after
        // the issue is resolved
        await delay(1000);

        // Also clear the stored token so that an error message gets shown next time there's a request
        errors++;
        if (errors > 5) {
          this.jwt = undefined;
        }
      }
    }
  }
}

export default new TokenAutorefresh();
