export type ProFeatureKey = 'diffAnalysis' | 'segmentation' | 'experiments'

// Hand-maintained allowlist granting pro features to users without a subscription.
// Add user IDs (graphql.user.id UUIDs) to the relevant feature.
// NOTE: read at module load — the graphql service must be restarted after editing.
export const PRO_FEATURE_WHITELIST: Record<ProFeatureKey, string[]> = {
  diffAnalysis: [],
  segmentation: [],
  experiments: [],
}

// Users listed here are granted every pro feature, equivalent to appearing in
// every list above. Same restart caveat applies.
export const ALL_PRO_FEATURES_WHITELIST: string[] = ['45054390-0e8b-11f1-b11d-effea393a45b']
