import { entitlementsToKeys, keysToEntitlements, ENTITLEMENT_KEYS } from './entitlements'

describe('projectSponsorship/entitlements', () => {
  it('maps every enum value to its wire key', () => {
    expect(ENTITLEMENT_KEYS).toEqual({
      PRIVATE_SUBMISSION: 'private_submission',
      PRIVATE_RESUBMISSION: 'private_resubmission',
      EXPERIMENTS: 'experiments',
      DIFF_ANALYSIS: 'diffAnalysis',
      SEGMENTATION: 'segmentation',
    })
  })

  it('dedupes and preserves order when converting to keys', () => {
    expect(entitlementsToKeys(['SEGMENTATION', 'EXPERIMENTS', 'SEGMENTATION'])).toEqual(['segmentation', 'experiments'])
  })

  it('drops unknown keys when converting back', () => {
    expect(keysToEntitlements(['experiments', 'bogus', 'private_submission']))
      .toEqual(['EXPERIMENTS', 'PRIVATE_SUBMISSION'])
  })
})
