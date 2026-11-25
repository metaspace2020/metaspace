import { describe, it, expect } from 'vitest'
import {
  buildClaimMessage,
  campaignLabels,
  escapeHtml,
  CAMPAIGNS,
  CLAIM_OPTIONS,
  couponFor,
  discountedCents,
  findCode,
  formatCampaignDate,
  getActiveCampaigns,
  packCode,
  termForMonths,
} from './campaign'
import type { BlackFridayCampaign } from './campaign'

const bf: BlackFridayCampaign = {
  start: '2026-11-27T00:00:00Z',
  end: '2026-12-31T23:59:59Z',
  headlinePercent: 50,
  codes: [
    { tier: 'essential', term: 'YEARLY', code: 'ESSENTIALPROMO1', percent: 50 },
    { tier: 'essential', term: 'TWO_YEARS', code: 'ESSENTIALPROMO2', percent: 40 },
    { tier: 'max', term: 'YEARLY', code: 'MAXPROMO1', percent: 30 },
    { tier: null, term: 'DATASET_PACK', code: 'PACKPROMO6', percent: 15 },
  ],
}

describe('campaign helpers', () => {
  it('computes discounted cents to the cent', () => {
    expect(discountedCents(99900, 50)).toBe(49950)
    expect(discountedCents(299900, 40)).toBe(179940)
    expect(discountedCents(499900, 35)).toBe(324935)
    expect(discountedCents(999900, 30)).toBe(699930)
    expect(discountedCents(34900, 15)).toBe(29665)
  })

  it('maps months to terms', () => {
    expect(termForMonths(12)).toBe('YEARLY')
    expect(termForMonths(24)).toBe('TWO_YEARS')
    expect(termForMonths(1)).toBeNull()
    expect(termForMonths(null)).toBeNull()
    expect(termForMonths(undefined)).toBeNull()
  })

  it('finds the code per tier and term', () => {
    expect(findCode(bf, 'essential', 'YEARLY')?.code).toBe('ESSENTIALPROMO1')
    expect(findCode(bf, 'essential', 'TWO_YEARS')?.code).toBe('ESSENTIALPROMO2')
    expect(findCode(bf, 'max', 'YEARLY')?.code).toBe('MAXPROMO1')
    expect(findCode(bf, 'max', 'TWO_YEARS')).toBeNull()
    expect(findCode(bf, 'free', 'YEARLY')).toBeNull()
    expect(findCode(null, 'essential', 'YEARLY')).toBeNull()
    expect(findCode(bf, 'essential', null)).toBeNull()
  })

  it('finds the pack code', () => {
    expect(packCode(bf)?.code).toBe('PACKPROMO6')
    expect(packCode(null)).toBeNull()
  })

  it('formats dates in UTC', () => {
    expect(formatCampaignDate('2026-12-31T23:59:59Z', false)).toBe('31 Dec')
    expect(formatCampaignDate('2026-12-31T23:59:59Z', true)).toBe('31 Dec 2026')
  })

  it('keeps the claim options ordered', () => {
    expect(CLAIM_OPTIONS.role.map((o) => o.key)).toEqual(['pi', 'postdoc', 'phd', 'core_facility', 'industry', 'other'])
    expect(CLAIM_OPTIONS.today.map((o) => o.key)).toEqual([
      'metaspace',
      'own_scripts',
      'other_software',
      'collaborator',
      'images_only',
    ])
    expect(CLAIM_OPTIONS.next).toEqual([
      { key: 'pathway', label: 'Pathway analysis' },
      { key: 'histology', label: 'Histology overlay' },
      { key: 'multi_omics', label: 'Multi-omics integration' },
      { key: 'cell_type', label: 'Cell-type analysis' },
    ])
    expect(Object.keys(CLAIM_OPTIONS)).toEqual(['role', 'today', 'next'])
  })

  describe('couponFor', () => {
    const plan = { id: 'p1' }

    it('returns the tier code for the term when the plan has a price', () => {
      expect(couponFor(bf, 'essential', 'YEARLY', plan, true, null)?.code).toBe('ESSENTIALPROMO1')
      expect(couponFor(bf, 'essential', 'TWO_YEARS', plan, true, null)?.code).toBe('ESSENTIALPROMO2')
    })

    it('returns the pack code for the pack', () => {
      expect(couponFor(bf, 'pack', null, plan, true, null)?.code).toBe('PACKPROMO6')
    })

    it('returns null without a campaign, a plan, a price, a code or on the active plan', () => {
      expect(couponFor(null, 'essential', 'YEARLY', plan, true, null)).toBeNull()
      expect(couponFor(bf, 'essential', 'YEARLY', null, true, null)).toBeNull()
      expect(couponFor(bf, 'essential', 'YEARLY', plan, false, null)).toBeNull()
      expect(couponFor(bf, 'essential', 'YEARLY', plan, true, 'p1')).toBeNull()
      expect(couponFor(bf, 'max', 'TWO_YEARS', plan, true, null)).toBeNull()
      expect(couponFor(bf, 'essential', null, plan, true, null)).toBeNull()
    })
  })
})

describe('getActiveCampaigns', () => {
  const at = (iso: string) => getActiveCampaigns(new Date(iso))

  it('has neither campaign before Black Friday', () => {
    expect(at('2026-11-26T12:00:00Z')).toEqual({ blackFriday: null, cyberMonday: null })
  })

  it('has only Black Friday with its nine codes before Cyber Monday', () => {
    const active = at('2026-11-28T12:00:00Z')
    expect(active.blackFriday).toMatchObject({ start: CAMPAIGNS.blackFriday.start, end: CAMPAIGNS.blackFriday.end })
    expect(active.blackFriday?.codes).toHaveLength(9)
    expect(active.cyberMonday).toBeNull()
  })

  it('shows the campaign as Black Friday until 13 Dec and as the year-end offer from 14 Dec', () => {
    const before = at('2026-12-13T23:59:59Z').blackFriday!
    const after = at('2026-12-14T00:00:00Z').blackFriday!
    expect(before.renamed).toBe(false)
    expect(campaignLabels(before)).toEqual({
      name: 'Black Friday',
      coupon: 'BLACK FRIDAY CODE',
      codes: 'Black Friday codes',
      code: 'Black Friday code',
    })
    expect(after.renamed).toBe(true)
    expect(campaignLabels(after)).toEqual({
      name: 'Year-end offer',
      coupon: 'YEAR-END',
      codes: 'Year-end codes',
      code: 'year-end code',
    })
    // Only the words change: codes, rates and the end date are the same object contents.
    expect(after.codes).toEqual(before.codes)
    expect(after.end).toBe(before.end)
    expect(after.headlinePercent).toBe(before.headlinePercent)
  })

  it('has both while the windows overlap', () => {
    const active = at('2026-12-01T12:00:00Z')
    expect(active.blackFriday).not.toBeNull()
    expect(active.cyberMonday).toBe(CAMPAIGNS.cyberMonday)
  })

  it('has only Black Friday after Cyber Monday closes', () => {
    const active = at('2026-12-14T00:00:00Z')
    expect(active.blackFriday).not.toBeNull()
    expect(active.cyberMonday).toBeNull()
  })

  it('has neither once both have ended', () => {
    expect(at('2027-01-01T00:00:00Z')).toEqual({ blackFriday: null, cyberMonday: null })
  })

  it('includes the start and end instants', () => {
    expect(at('2026-11-27T00:00:00Z').blackFriday).not.toBeNull()
    expect(at('2026-11-26T23:59:59Z').blackFriday).toBeNull()
    expect(at('2026-12-31T23:59:59Z').blackFriday).not.toBeNull()
    expect(at('2026-12-31T23:59:59.001Z').blackFriday).toBeNull()
    expect(at('2026-11-30T00:00:00Z').cyberMonday).not.toBeNull()
    expect(at('2026-12-13T23:59:59Z').cyberMonday).not.toBeNull()
  })
})

describe('buildClaimMessage', () => {
  it('prints every answer with option labels', () => {
    expect(
      buildClaimMessage({
        organisation: '  EMBL ',
        role: 'postdoc',
        today: 'own_scripts',
        next: ['multi_omics', 'pathway'],
        wish: '  more figures ',
      })
    ).toBe(
      [
        'Cyber Monday free month claim',
        'Institution or company: EMBL',
        'Role: Postdoc / staff scientist',
        'Analyses annotations today: Export and analyse with our own scripts (R, Python)',
        'Wants next: Pathway analysis; Multi-omics integration',
        'Something else: more figures',
        'Agreed to Terms and Privacy policy: yes',
      ].join('<br>\n')
    )
  })

  it('prints a dash for unanswered optional fields', () => {
    expect(buildClaimMessage({ organisation: 'EMBL', role: 'pi', today: '', next: [], wish: '' })).toBe(
      [
        'Cyber Monday free month claim',
        'Institution or company: EMBL',
        'Role: PI / group leader',
        'Analyses annotations today: -',
        'Wants next: -',
        'Something else: -',
        'Agreed to Terms and Privacy policy: yes',
      ].join('<br>\n')
    )
  })

  it('escapes markup in user-typed values and keeps the lines apart with <br>', () => {
    const message = buildClaimMessage({
      organisation: 'a<b & <em>x</em>',
      role: 'pi',
      today: 'images_only',
      next: [],
      wish: 'a<b & <em>x</em>',
    })
    expect(message).toContain('Institution or company: a&lt;b &amp; &lt;em&gt;x&lt;/em&gt;<br>\n')
    expect(message).toContain('Something else: a&lt;b &amp; &lt;em&gt;x&lt;/em&gt;<br>\n')
    expect(message).not.toContain('<em>')
    expect(message.split('<br>\n')).toHaveLength(7)
    expect(escapeHtml('a<b & <em>x</em>')).toBe('a&lt;b &amp; &lt;em&gt;x&lt;/em&gt;')
  })
})
