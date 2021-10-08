import { getJWT, decodePayload } from '../lib/util'
import delay from '../lib/delay'

const REFRESH_INTERVAL_MS = 30000

class TokenAutorefresh {
  jwt?: string;
  jwtPromise?: Promise<string>;
  jwtCanExpire: boolean = true;
  refreshLoopRunning: boolean = false;

  constructor() {
    // noinspection JSIgnoredPromiseFromCall
    this.ensureRefreshLoopRunning()
  }

  async getJwt() {
    // noinspection JSIgnoredPromiseFromCall
    this.ensureRefreshLoopRunning()
    while (this.jwt == null && this.jwtPromise != null) {
      await this.jwtPromise
    }
    return this.jwt
  }

  async waitForAuth() {
    await this.getJwt()
  }

  async refreshJwt(invalidateOldJwt: boolean = false) {
    if (invalidateOldJwt) {
      this.jwt = undefined
    }
    const promise = this.jwtPromise = getJWT()
    const jwt = await promise

    // Only overwrite the jwt if another refresh hasn't started while this one has been waiting
    if (this.jwtPromise === promise) {
      this.jwt = jwt
      this.jwtPromise = undefined
      const payload = decodePayload(this.jwt)
      this.jwtCanExpire = payload.exp != null
    }
    return this.getJwt()
  }

  private async ensureRefreshLoopRunning() {
    if (this.refreshLoopRunning) {
      return
    }
    this.refreshLoopRunning = true
    while (true) {
      try {
        if (!this.jwt || this.jwtCanExpire) {
          await this.refreshJwt()
        }
        await delay(REFRESH_INTERVAL_MS)
      } catch (err) {
        // After a failure, clear the stored token and stop refreshing.
        // This allows the next request to retry fetching the token and alert the user if something is wrong.
        this.jwt = undefined
        break
      }
    }
    this.refreshLoopRunning = false
  }
}

export default new TokenAutorefresh()
