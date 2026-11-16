import { FIELD_DEFS } from './formDefinition'
import { FieldKey } from './types'

export interface ServerError {
  dataPath: string
  message: string
}

const V2_PREFIX = '.metadataV2.'

/**
 * Server validation errors arrive in two shapes: dot paths into the projected legacy record
 * (".Sample_Information.Organism") and dot paths into the envelope (".metadataV2.document.sample.organism…").
 * Both are matched by prefix against the catalogue; the first message per field wins.
 */
export function mapServerErrors(errors: ServerError[]): {
  fieldErrors: Partial<Record<FieldKey, string>>
  otherErrors: string[]
} {
  const fieldErrors: Partial<Record<FieldKey, string>> = {}
  const otherErrors: string[] = []
  errors.forEach(({ dataPath, message }) => {
    const path = dataPath || ''
    let key: FieldKey | undefined
    if (path.startsWith(V2_PREFIX)) {
      const inner = path.slice(V2_PREFIX.length)
      key = FIELD_DEFS.find((f) => inner === f.path || inner.startsWith(f.path + '.'))?.key
    } else {
      const inner = path.replace(/^\./, '')
      key = FIELD_DEFS.find((f) => f.legacyPath && (inner === f.legacyPath || inner.startsWith(f.legacyPath + '.')))
        ?.key
    }
    if (key) {
      if (!fieldErrors[key]) {
        fieldErrors[key] = message
      }
    } else {
      otherErrors.push(`${path}: ${message}`)
    }
  })
  return { fieldErrors, otherErrors }
}
