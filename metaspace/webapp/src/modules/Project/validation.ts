export function parseValidationErrors(err: any): { [field: string]: string } {
  const fieldToMessage: { [field: string]: string } = {}
  if (err.graphQLErrors) {
    for (const gqlError of err.graphQLErrors) {
      const { type, errors = [] } = JSON.parse(gqlError.message)
      if (type === 'failed_validation') {
        for (const e of errors) {
          fieldToMessage[e.field] = e.message
        }
      }
      gqlError.isHandled = true
    }
  }
  return fieldToMessage
}
