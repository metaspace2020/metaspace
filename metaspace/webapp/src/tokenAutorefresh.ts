import { getJWT, decodePayload } from './util';
import Vue from 'vue';

class TokenAutorefresh extends Vue {
  jwt: string
  payload: { sub: string }

  private timer: number;
  private interval = 30000; // 30 seconds

  constructor() {
    super();
    this.execute();
  }

  private async execute() {
    this.jwt = await getJWT();
    const payload = decodePayload(this.jwt);
    this.payload = {sub: payload.sub};
    console.log(payload);
    const delay = payload.exp ? this.interval : 0; // update the token every 30 seconds
    if (delay > 0)
      this.timer = window.setTimeout(() => this.execute(), delay);
  }
}

export default new TokenAutorefresh();
