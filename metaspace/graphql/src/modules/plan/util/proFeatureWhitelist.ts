export type ProFeatureKey = 'diffAnalysis' | 'segmentation'

// Hand-maintained allowlist granting pro features to users without a subscription.
// Add user IDs (graphql.user.id UUIDs) to the relevant feature.
// NOTE: read at module load — the graphql service must be restarted after editing.
export const PRO_FEATURE_WHITELIST: Record<ProFeatureKey, string[]> = {
  diffAnalysis: [],
  segmentation: [],
}
