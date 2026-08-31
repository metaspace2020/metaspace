import { describe, it, expect } from 'vitest'
import { resolveTier, TIER_SPECS, CARD_TIERS, COMPARISON_GROUPS, bulletText } from './proContent'
import type { ProTier } from './proContent'
import type { Plan } from '../../api/plan'

const ALL_TIERS: ProTier[] = ['free', 'essential', 'advanced', 'premium', 'max']

const plan = (overrides: Partial<Plan>): Plan =>
  ({
    id: 'p',
    tier: '',
    name: '',
    description: '',
    isActive: true,
    isDefault: false,
    displayOrder: 0,
    pricingOptions: [],
    planRules: [],
    ...overrides,
  }) as unknown as Plan

describe('resolveTier', () => {
  // Regression guard for the live dev/production database: `plan.tier` there
  // is a coarse BILLING CATEGORY ('free' | 'standard' | 'premium'), not the
  // plan's identity, so it can collide with an unrelated tier's alias (e.g.
  // the "Low" plan - which must render as Essential - carries tier "free").
  // Name must win whenever it resolves to something; tier is only a fallback
  // for plans whose name matches no alias at all.
  it('matches the plan name first, even when the backend tier field disagrees', () => {
    // Exact live data pulled from the dev stack: tier-first resolution would
    // misresolve "Low" (tier "free") as the Free tier and Essential would
    // never render. Name-first fixes it.
    expect(resolveTier(plan({ name: 'Low', tier: 'free' }))).toBe('essential')
    expect(resolveTier(plan({ name: 'Medium', tier: 'standard' }))).toBe('advanced')
    expect(resolveTier(plan({ name: 'High', tier: 'premium' }))).toBe('premium')
    expect(resolveTier(plan({ name: 'Ultra', tier: 'premium' }))).toBe('max')
  })

  // Genuine new collision introduced by the rename: 'premium' is now BOTH a
  // display name (the third card tier) AND a value the backend `tier` column
  // can hold ("High" and "Ultra" share the coarse category "premium"). Name
  // must still win so a plan named "Ultra" never misresolves to the `premium`
  // tier just because its `tier` column happens to say "premium".
  it('does not let plan.tier "premium" hijack a differently-named plan, now that premium is also a tier key', () => {
    expect(resolveTier(plan({ name: 'Ultra', tier: 'premium' }))).toBe('max')
    expect(resolveTier(plan({ name: 'High', tier: 'premium' }))).toBe('premium')
  })

  it('falls back to the backend tier only when the name matches no alias', () => {
    expect(resolveTier(plan({ tier: 'medium', name: '' }))).toBe('advanced')
    expect(resolveTier(plan({ tier: 'ULTRA', name: 'Anything' }))).toBe('max')
  })

  it('falls back to a name substring when tier is empty', () => {
    expect(resolveTier(plan({ tier: '', name: 'Low' }))).toBe('essential')
    expect(resolveTier(plan({ tier: '', name: 'High plan' }))).toBe('premium')
    expect(resolveTier(plan({ tier: '', name: 'Free' }))).toBe('free')
  })

  it('resolves the new names too, so a future DB rename keeps working', () => {
    expect(resolveTier(plan({ tier: 'essential', name: 'Essential' }))).toBe('essential')
    expect(resolveTier(plan({ tier: 'advanced', name: 'Advanced' }))).toBe('advanced')
    expect(resolveTier(plan({ tier: '', name: 'Premium' }))).toBe('premium')
    expect(resolveTier(plan({ tier: 'max', name: 'Max' }))).toBe('max')
    expect(resolveTier(plan({ tier: 'free', name: 'Free' }))).toBe('free')
  })

  it('returns null for an unknown plan rather than guessing', () => {
    expect(resolveTier(plan({ tier: 'enterprise', name: 'Mystery' }))).toBeNull()
  })

  it('does not match when an alias appears only as a substring', () => {
    expect(resolveTier(plan({ tier: '', name: 'Follow-up plan' }))).toBeNull()
    expect(resolveTier(plan({ tier: '', name: 'Slow reprocessing' }))).toBeNull()
    expect(resolveTier(plan({ tier: '', name: 'Collaborative plan' }))).toBeNull()
    expect(resolveTier(plan({ tier: '', name: 'Highlight tier' }))).toBeNull()
  })

  it('matches legitimate multi-word names with aliases as whole tokens', () => {
    expect(resolveTier(plan({ tier: '', name: 'Low priority' }))).toBe('essential')
    expect(resolveTier(plan({ tier: '', name: 'High performance' }))).toBe('premium')
    expect(resolveTier(plan({ tier: '', name: 'Lab certified' }))).toBe('advanced')
  })
})

describe('TIER_SPECS', () => {
  it('has an entry for every tier with the renamed labels', () => {
    expect(TIER_SPECS.free.label).toBe('Free')
    expect(TIER_SPECS.essential.label).toBe('Essential')
    expect(TIER_SPECS.advanced.label).toBe('Advanced')
    expect(TIER_SPECS.premium.label).toBe('Premium')
    expect(TIER_SPECS.max.label).toBe('Max')
  })

  it('marks only Advanced as the highlighted card', () => {
    const highlighted = CARD_TIERS.filter((t) => TIER_SPECS[t].highlight)
    expect(highlighted).toEqual(['advanced'])
  })

  it('describes every tier in one sentence, so the cards stay the same height', () => {
    ALL_TIERS.forEach((tier) => {
      expect(TIER_SPECS[tier].blurb, tier).toBeTruthy()
    })
    expect(TIER_SPECS.essential.blurb).toBe('For occasional private work running alongside your published projects.')
    expect(TIER_SPECS.advanced.blurb).toBe('For steady private throughput, with several people submitting regularly.')
    expect(TIER_SPECS.premium.blurb).toBe('For continuous private work, including client work under confidentiality.')
  })

  it('bolds the allowance number in each numeric bullet, leaving the rest of the line unemphasised', () => {
    // The design sets the number in ink inside an otherwise muted line, so the
    // bullets must carry that structure as data - a plain string could only be
    // rendered flat.
    const first = TIER_SPECS.essential.bullets[0]
    expect(first[0]).toEqual({ text: '30', style: 'strong' })
    expect(first[1]).toEqual({ text: ' private datasets a year' })
    expect(bulletText(first)).toBe('30 private datasets a year')
    // Non-numeric bullets carry no emphasis at all.
    expect(TIER_SPECS.essential.bullets[2].every((s) => s.style === undefined)).toBe(true)
  })

  it('italicises "on those datasets" in the Free summary', () => {
    const toolsBullet = TIER_SPECS.free.bullets.find((b) => bulletText(b).includes('analysis tools'))!
    expect(toolsBullet.some((segment) => segment.style === 'em' && segment.text === 'on those datasets')).toBe(true)
  })
})

describe('CARD_TIERS', () => {
  it('renders exactly three cards - Essential, Advanced and Premium', () => {
    expect(CARD_TIERS).toEqual(['essential', 'advanced', 'premium'])
    expect(CARD_TIERS).toHaveLength(3)
  })

  // Regression guard for the real bug this section had: Max was listed here,
  // so it rendered as a fourth card in the grid. In the design Max is a
  // full-width strip below the cards, never a card.
  it('excludes max, which is a full-width strip rather than a card', () => {
    expect(CARD_TIERS).not.toContain('max')
  })

  // ...but excluding it from the GRID must not demote it as a tier: every
  // other consumer (resolution, coupons, specs, comparison table) still has
  // to treat max as a first-class tier.
  it('keeps max a fully supported tier everywhere outside the card grid', () => {
    expect(resolveTier(plan({ name: 'Ultra', tier: 'premium' }))).toBe('max')
    expect(resolveTier(plan({ name: 'Max', tier: 'max' }))).toBe('max')
    expect(TIER_SPECS.max.label).toBe('Max')
    COMPARISON_GROUPS.forEach((group) => group.rows.forEach((row) => expect(row.value('max'), row.name).toBeTruthy()))
  })
})

describe('COMPARISON_GROUPS', () => {
  const rowNamed = (name: string) => COMPARISON_GROUPS.flatMap((g) => g.rows).find((r) => r.name === name)!

  it('covers the four comparison bands, with the analysis band qualified by the allowance', () => {
    expect(COMPARISON_GROUPS.map((g) => g.title)).toEqual([
      'Analysis — on every plan, within your private dataset allowance',
      'Privacy & scale',
      'Support',
      'Commercial',
    ])
  })

  it('every row resolves a value for every tier', () => {
    COMPARISON_GROUPS.forEach((group) =>
      group.rows.forEach((row) =>
        ALL_TIERS.forEach((tier) => expect(row.value(tier), `${row.name} / ${tier}`).toBeTruthy())
      )
    )
  })

  it('states the analysis rows as included on every paid tier', () => {
    const paid: ProTier[] = ['essential', 'advanced', 'premium', 'max']
    ;['ROI differential analysis', 'Spatial segmentation', 'Cross-dataset statistics'].forEach((name) =>
      paid.forEach((tier) => expect(rowNamed(name).value(tier), `${name} / ${tier}`).toBe('Included'))
    )
  })

  // The citability claim is made once, in the FAQ. It was dropped from the
  // table along with the methods section, so the analysis band lists exactly
  // the three tools and nothing else.
  it('lists only the three analysis tools in the analysis band', () => {
    expect(COMPARISON_GROUPS[0].rows.map((row) => row.name)).toEqual([
      'ROI differential analysis',
      'Spatial segmentation',
      'Cross-dataset statistics',
    ])
    expect(COMPARISON_GROUPS.flatMap((g) => g.rows).map((r) => r.name)).not.toContain('Documented, citable methods')
  })

  it('counts the per-dataset allowances in datasets, never in "experiments"', () => {
    // Regression guard: the per-dataset rows must not drift back into
    // counting "experiments". Cross-dataset statistics is deliberately
    // exempt - it is scoped by experiment, not by dataset, so the Free cell
    // there reads "On your first 3 experiments" by design.
    const perDataset = [
      'ROI differential analysis',
      'Spatial segmentation',
      'Private datasets per year',
      'Private reprocessings per year',
    ]
    perDataset.forEach((name) =>
      ALL_TIERS.forEach((tier) => expect(rowNamed(name).value(tier), `${name} / ${tier}`).not.toMatch(/experiments/i))
    )
    expect(rowNamed('Cross-dataset statistics').value('free')).toBe('On your first 3 experiments')
  })

  it('quotes the private throughput ladder the cards and the Max strip sell', () => {
    expect(ALL_TIERS.map((t) => rowNamed('Private datasets per year').value(t))).toEqual([
      '3',
      '30',
      '100',
      '300',
      '1,000+',
    ])
    expect(ALL_TIERS.map((t) => rowNamed('Private reprocessings per year').value(t))).toEqual([
      '6',
      '60',
      '200',
      '600',
      '2,000+',
    ])
  })

  it('shows unlimited people and projects, and export, on every tier including free', () => {
    ALL_TIERS.forEach((tier) => {
      expect(rowNamed('Group members').value(tier), tier).toBe('Unlimited')
      expect(rowNamed('Projects').value(tier), tier).toBe('Unlimited')
      expect(rowNamed('Export results any time*').value(tier), tier).toBe('Yes')
    })
  })

  it('offers purchase orders and the price lock on every paid tier, but not on free', () => {
    const commercial = ['Purchase order & invoice', 'Multi-year price lock']
    commercial.forEach((name) => {
      expect(rowNamed(name).value('free'), name).toBe('—')
      ;(['essential', 'advanced', 'premium', 'max'] as ProTier[]).forEach((tier) =>
        expect(rowNamed(name).value(tier), `${name} / ${tier}`).toBe('Yes')
      )
    })
  })
})
