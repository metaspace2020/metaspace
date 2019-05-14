import * as Raven from 'raven-js';

export default function safeJsonParse(json: string | null | undefined) {
  if (json) {
    try {
      return JSON.parse(json);
    } catch (err) {
      Raven.captureException(err);
    }
  }
  return undefined;
}
