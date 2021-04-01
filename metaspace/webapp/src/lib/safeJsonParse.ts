import reportError from './reportError'

export default function safeJsonParse(json: string | null | undefined) {
  if (json) {
    try {
      return JSON.parse(json)
    } catch (err) {
      reportError(err, null)
    }
  }
  return undefined
}
