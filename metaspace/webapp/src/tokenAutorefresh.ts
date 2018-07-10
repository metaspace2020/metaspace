import { getJWT, decodePayload, delay } from './util'

const REFRESH_INTERVAL_MS = 30000;

class TokenAutorefresh {
  jwt?: string;
  jwtPromise?: Promise<string>;
  jwtCanExpire: boolean = true;
  jwtListeners: ((jwt?: string, payload?: any) => void)[] = [];
  refreshLoopRunning: boolean = false;

  constructor() {
    this.ensureRefreshLoopRunning();
  }

  async getJwt() {
    this.ensureRefreshLoopRunning();
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

  private async ensureRefreshLoopRunning() {
    if (this.refreshLoopRunning) {
      return
    }
    this.refreshLoopRunning = true;
    while (true) {
      try {
        if (!this.jwt || this.jwtCanExpire) {
          await this.refreshJwt();
        }
        await delay(REFRESH_INTERVAL_MS);
      } catch (err) {
        // After a failure, clear the stored token and stop refreshing.
        // This allows the next request to retry fetching the token and alert the user if something is wrong.
        this.jwt = undefined;
        break;
      }
    }
    this.refreshLoopRunning = false;
  }
}

export default new TokenAutorefresh();
