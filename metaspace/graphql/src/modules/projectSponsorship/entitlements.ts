export type ProjectEntitlement =
  'PRIVATE_SUBMISSION' | 'PRIVATE_RESUBMISSION' | 'EXPERIMENTS' | 'DIFF_ANALYSIS' | 'SEGMENTATION'

/** GraphQL enum value -> entitlement key used by the manager service. */
export const ENTITLEMENT_KEYS: Record<ProjectEntitlement, string> = {
  PRIVATE_SUBMISSION: 'private_submission',
  PRIVATE_RESUBMISSION: 'private_resubmission',
  EXPERIMENTS: 'experiments',
  DIFF_ANALYSIS: 'diffAnalysis',
  SEGMENTATION: 'segmentation',
}

const KEY_TO_ENTITLEMENT = Object.keys(ENTITLEMENT_KEYS).reduce((acc, e) => {
  acc[ENTITLEMENT_KEYS[e as ProjectEntitlement]] = e as ProjectEntitlement
  return acc
}, {} as Record<string, ProjectEntitlement>)

/** Converts enum values to wire keys, deduplicated, keeping the input order. */
export const entitlementsToKeys = (entitlements: ProjectEntitlement[]): string[] =>
  Array.from(new Set(entitlements)).map(e => ENTITLEMENT_KEYS[e])

/** Converts wire keys to enum values, keeping the input order; unknown keys are dropped. */
export const keysToEntitlements = (keys: string[]): ProjectEntitlement[] =>
  keys.filter(k => Object.prototype.hasOwnProperty.call(KEY_TO_ENTITLEMENT, k)).map(k => KEY_TO_ENTITLEMENT[k])
