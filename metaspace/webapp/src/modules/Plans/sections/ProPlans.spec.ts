import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ProPlans, { groupThousands } from './ProPlans'
import type { Plan, PricingOption } from '../../../api/plan'

const period: PricingOption = {
  id: 'y1',
  periodMonths: 12,
  priceCents: 0,
  displayName: '1 year',
  isActive: true,
  displayOrder: 1,
}

// A billing term that none of the fixture plans below offer (they only carry
// a "1 year" pricingOptions entry). Used to prove that selecting a period a
// plan doesn't have never falls back to advertising "$0" with a live CTA.
const unmatchedPeriod: PricingOption = {
  id: 'y3',
  periodMonths: 36,
  priceCents: 0,
  displayName: '3 years',
  isActive: true,
  displayOrder: 3,
}

const makePlan = (id: string, tier: string, name: string, cents: number): Plan =>
  ({
    id,
    tier,
    name,
    description: '',
    isActive: true,
    isDefault: false,
    displayOrder: 1,
    pricingOptions: [{ ...period, priceCents: cents }],
    planRules: [],
  }) as unknown as Plan

const plans = [
  makePlan('free', 'free', 'Free', 0),
  makePlan('p1', 'low', 'Low', 99900),
  makePlan('p2', 'medium', 'Medium', 299900),
  makePlan('p3', 'high', 'High', 499900),
  makePlan('p4', 'ultra', 'Ultra', 999900),
]

const stubs = { ElRadioGroup: true, ElRadioButton: true, ElSkeleton: true, ElSkeletonItem: true }

const mountPlans = (overrides = {}) =>
  mount(ProPlans, {
    props: {
      plans,
      loading: false,
      selectedPeriod: period,
      availablePeriods: [period],
      radioValue: '1 year',
      activePlanId: null,
      ...overrides,
    },
    global: { stubs },
  })

const cardTiers = (wrapper: ReturnType<typeof mountPlans>) => wrapper.findAll('.pro-card__tier').map((n) => n.text())

describe('ProPlans card grid', () => {
  it('renders exactly three cards - Essential, Advanced and Premium', () => {
    const wrapper = mountPlans()
    expect(cardTiers(wrapper)).toEqual(['Essential', 'Advanced', 'Premium'])
    expect(wrapper.findAll('.pro-card')).toHaveLength(3)
  })

  // Regression guard for the structural bug: Max used to be listed in
  // CARD_TIERS, so it rendered as a fourth card and broke the three-column
  // grid. Max belongs on the page - as a full-width strip below the lock
  // note - but never inside the grid.
  it('never renders Max as a card, even though Max is on the page', () => {
    const wrapper = mountPlans()
    expect(cardTiers(wrapper)).not.toContain('Max')
    wrapper.findAll('.pro-card').forEach((card) => {
      expect(card.find('[data-test="subscribe-max"]').exists()).toBe(false)
    })
    // ...and it IS on the page, outside the grid.
    expect(wrapper.find('[data-test="max-strip"]').exists()).toBe(true)
  })

  it('features Advanced with the "MOST CHOSEN" badge, and nothing else', () => {
    const wrapper = mountPlans()
    const highlighted = wrapper.findAll('.pro-card--highlight')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0].find('.pro-card__tier').text()).toBe('Advanced')
    expect(highlighted[0].find('.pro-card__badge').text()).toBe('MOST CHOSEN')
    // No other card carries a badge.
    expect(wrapper.findAll('.pro-card__badge')).toHaveLength(1)
  })

  it('renders the correct price on each card, not merely a price anywhere in the page', () => {
    // A plain text().toContain('2,999') check would still pass if Essential
    // and Advanced's prices were swapped. Scope each assertion to its own card.
    const wrapper = mountPlans()
    const priceByTier: Record<string, string> = {}
    wrapper.findAll('.pro-card').forEach((card) => {
      priceByTier[card.find('.pro-card__tier').text()] = card.find('.pro-card__price').text()
    })
    expect(priceByTier.Essential).toBe('$999')
    expect(priceByTier.Advanced).toBe('$2,999')
    expect(priceByTier.Premium).toBe('$4,999')
  })

  it('bolds the allowance number inside an otherwise plain feature line', () => {
    const wrapper = mountPlans()
    const essential = wrapper.findAll('.pro-card').find((c) => c.find('.pro-card__tier').text() === 'Essential')!
    const firstBullet = essential.findAll('.pro-card__bullets li')[0]
    expect(firstBullet.find('b').text()).toBe('30')
    expect(firstBullet.text()).toBe('30 private datasets a year')
  })

  it('emits subscribe with the plan id when a card CTA is clicked', async () => {
    const wrapper = mountPlans()
    await wrapper.find('[data-test="subscribe-advanced"]').trigger('click')
    expect(wrapper.emitted('subscribe')?.[0]).toEqual(['p2'])
  })

  it('shows the already-subscribed state instead of a CTA', () => {
    const wrapper = mountPlans({ activePlanId: 'p2' })
    expect(wrapper.text()).toContain('Already enjoying the benefits!')
    expect(wrapper.find('[data-test="subscribe-advanced"]').exists()).toBe(false)
  })

  it('excludes a plan whose tier cannot be resolved, rather than rendering it unlabelled', () => {
    const unresolved = makePlan('mystery', 'mystery-tier', 'Mystery Plan', 12300)
    const wrapper = mountPlans({ plans: [...plans, unresolved] })
    // Still exactly 3 cards - the unresolved plan is not appended as a 4th.
    expect(wrapper.findAll('.pro-card')).toHaveLength(3)
    expect(cardTiers(wrapper)).toEqual(['Essential', 'Advanced', 'Premium'])
    expect(wrapper.text()).not.toContain('Mystery Plan')
    expect(wrapper.text()).not.toContain('123')
  })

  it('resolves duplicate-tier plans by lowest displayOrder, matching the old PlansPage behaviour', async () => {
    // A grandfathered plan and the current plan can both resolve to
    // "advanced". The lowest displayOrder must win deterministically so the
    // CTA always carries the correct planId to checkout, regardless of API
    // ordering.
    const legacyAdvanced = {
      ...makePlan('legacy-advanced', 'medium', 'Legacy Advanced', 199900),
      displayOrder: 0,
    } as unknown as Plan
    const currentAdvanced = { ...makePlan('p2', 'medium', 'Medium', 299900), displayOrder: 5 } as unknown as Plan
    const wrapper = mountPlans({
      plans: [
        makePlan('free', 'free', 'Free', 0),
        makePlan('p1', 'low', 'Low', 99900),
        currentAdvanced,
        legacyAdvanced,
        makePlan('p3', 'high', 'High', 499900),
        makePlan('p4', 'ultra', 'Ultra', 999900),
      ],
    })

    // Only one Advanced card renders, not two.
    expect(cardTiers(wrapper)).toEqual(['Essential', 'Advanced', 'Premium'])
    await wrapper.find('[data-test="subscribe-advanced"]').trigger('click')
    expect(wrapper.emitted('subscribe')?.[0]).toEqual(['legacy-advanced'])
  })
})

describe('ProPlans Free strip', () => {
  it('renders the Free strip above the card grid, not as a card', () => {
    const wrapper = mountPlans()
    expect(wrapper.text()).toContain('Free — included with every METASPACE account')
    expect(cardTiers(wrapper)).not.toContain('Free')
    expect(wrapper.text()).toContain('Submit your first private dataset')
  })

  it('summarises the free allowance in one line, italicising the scope of the analysis tools', () => {
    const wrapper = mountPlans()
    const copy = wrapper.find('.pro-strip__copy')
    expect(copy.text()).toBe(
      '3 private datasets a year · 6 reprocessings · all three analysis tools on those datasets · ' +
        'email support in 3 working days'
    )
    expect(copy.find('em').text()).toBe('on those datasets')
  })
})

describe('ProPlans Max strip', () => {
  const maxStrip = (wrapper: ReturnType<typeof mountPlans>) => wrapper.find('[data-test="max-strip"]')

  it('renders Max as a full-width strip carrying its backend price and its own CTA', () => {
    const wrapper = mountPlans()
    const strip = maxStrip(wrapper)
    expect(strip.exists()).toBe(true)
    expect(strip.find('.pro-strip__price').text()).toBe('$9,999')
    expect(strip.find('.pro-strip__price-note').text()).toBe('a year')
    expect(strip.find('[data-test="subscribe-max"]').text()).toBe('Choose Max')
    // The strip is not a card and must not be styled as one.
    expect(strip.classes()).toContain('pro-strip')
    expect(strip.classes()).not.toContain('pro-card')
  })

  it('keeps Max purchasable from the strip', async () => {
    const wrapper = mountPlans()
    await maxStrip(wrapper).find('[data-test="subscribe-max"]').trigger('click')
    expect(wrapper.emitted('subscribe')?.[0]).toEqual(['p4'])
  })

  it('shows the already-subscribed state on the Max strip instead of its CTA', () => {
    // Regression guard: the card test above only covers Advanced. Without
    // this, dropping the active-subscription check on the Max path would let
    // an existing Max subscriber re-purchase.
    const wrapper = mountPlans({ activePlanId: 'p4' })
    expect(maxStrip(wrapper).text()).toContain('Already enjoying the benefits!')
    expect(wrapper.find('[data-test="subscribe-max"]').exists()).toBe(false)
  })

  it('links to procurement for volumes beyond Max rather than showing a fifth price', () => {
    const wrapper = mountPlans()
    const link = maxStrip(wrapper).find('[data-test="request-quote"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('Need more volume? →')
    expect(link.attributes('href')).toBe('/contact')
  })

  it('does not render the Max strip at all when the backend returns no Max plan', () => {
    // Never invent a Max price from static copy: the strip is a real,
    // backend-priced purchase path like the cards.
    const wrapper = mountPlans({ plans: plans.filter((p) => p.id !== 'p4') })
    expect(wrapper.find('[data-test="max-strip"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('$9,999')
  })
})

describe('ProPlans dataset pack', () => {
  afterEach(() => {
    vi.resetModules()
  })

  const mountWithFlags = async (flags: Record<string, boolean>) => {
    vi.doMock('../proContent', async () => {
      const actual: any = await vi.importActual('../proContent')
      return { ...actual, PRO_FLAGS: { ...actual.PRO_FLAGS, ...flags } }
    })
    const Component = (await import('./ProPlans')).default
    return mount(Component, {
      props: {
        plans,
        loading: false,
        selectedPeriod: period,
        availablePeriods: [period],
        radioValue: '1 year',
        activePlanId: null,
      },
      global: { stubs },
    })
  }

  it('renders the one-off pack quieter than a tier, when its flag is on', async () => {
    const wrapper = await mountWithFlags({ datasetPack: true })
    const pack = wrapper.find('.pro-datapack')
    expect(pack.exists()).toBe(true)
    expect(pack.find('.pro-datapack__title').text()).toBe('Dataset pack — no subscription $350')
    expect(pack.find('.pro-datapack__copy').text()).toBe(
      '10 private datasets, valid 6 months from purchase, all downstream analysis tools included. One-off payment ' +
        '— nothing renews.'
    )
    expect(pack.find('[data-test="buy-dataset-pack"]').text()).toBe('Buy a pack')
    // It is not a card, and its CTA is not a plan CTA.
    expect(pack.classes()).not.toContain('pro-card')
  })

  it('disappears entirely when its flag is off, since checkout cannot sell it yet', async () => {
    const wrapper = await mountWithFlags({ datasetPack: false })
    expect(wrapper.find('.pro-datapack').exists()).toBe(false)
    expect(wrapper.find('[data-test="buy-dataset-pack"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Dataset pack')
    expect(wrapper.text()).not.toContain('$350')
    // The rest of the section is untouched.
    expect(wrapper.findAll('.pro-card')).toHaveLength(3)
  })
})

describe('ProPlans no-per-seat note', () => {
  it('states that nothing is priced per seat, on any plan', () => {
    const wrapper = mountPlans()
    const note = wrapper.find('.pro-seatnote')
    expect(note.exists()).toBe(true)
    expect(note.find('b').text()).toBe('No per-seat pricing, on any plan.')
    expect(note.text()).toContain('Unlimited group members and unlimited projects, including on Free.')
  })
})

describe('ProPlans loading and failure states', () => {
  it('shows skeletons while loading', () => {
    const wrapper = mountPlans({ loading: true })
    expect(wrapper.findAll('.pro-card')).toHaveLength(0)
  })

  it('does not render the Max strip or the table while loading', () => {
    const wrapper = mountPlans({ loading: true })
    expect(wrapper.find('[data-test="max-strip"]').exists()).toBe(false)
    expect(wrapper.find('.pro-table').exists()).toBe(false)
  })

  it('shows a fallback when no plans resolve, without losing Free or the dataset pack', () => {
    // The dev database may have no plan rows at all. The parts of the section
    // that don't depend on backend pricing must still render.
    const wrapper = mountPlans({ plans: [] })
    expect(wrapper.text()).toContain('Plans are temporarily unavailable')
    expect(wrapper.text()).toContain('Free — included with every METASPACE account')
    expect(wrapper.find('.pro-datapack').exists()).toBe(true)
    // ...but nothing that would need a price it doesn't have.
    expect(wrapper.find('[data-test="max-strip"]').exists()).toBe(false)
    expect(wrapper.findAll('.pro-card')).toHaveLength(0)
  })
})

describe('ProPlans comparison table', () => {
  it('renders the four group bands', () => {
    const wrapper = mountPlans()
    const groups = wrapper.findAll('.pro-table__group th').map((n) => n.text())
    expect(groups).toEqual([
      'Analysis — on every plan, within your private dataset allowance',
      'Privacy & scale',
      'Support',
      'Commercial',
    ])
  })

  it('renders a header column for every tier including free and max', () => {
    const wrapper = mountPlans()
    const headerRow = wrapper.find('.pro-table thead tr')
    const headers = headerRow.findAll('th').map((n) => n.text())
    // First <th> is the blank corner cell above the row labels.
    expect(headers.slice(1)).toEqual(['Free', 'Essential', 'Advanced', 'Premium', 'Max'])
  })

  it('marks only the Advanced column header as the featured one', () => {
    const wrapper = mountPlans()
    const highlighted = wrapper.findAll('.pro-table thead th.is-highlight')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0].text()).toBe('Advanced')
  })

  it('spans group header rows across every column', () => {
    const wrapper = mountPlans()
    const groupHeaderCells = wrapper.findAll('.pro-table__group th')
    // One column for row labels + one per tier (5 tiers).
    groupHeaderCells.forEach((cell) => {
      expect(cell.attributes('colspan')).toBe('6')
    })
  })

  it('renders "—" cells as faint rather than as accented values', () => {
    const wrapper = mountPlans()
    const empties = wrapper.findAll('.pro-table td.is-empty')
    expect(empties.length).toBeGreaterThan(0)
    empties.forEach((cell) => {
      expect(cell.text()).toBe('—')
      expect(cell.classes()).not.toContain('is-accent')
    })
  })
})

describe('ProPlans unavailable billing terms', () => {
  it('never shows "$0" with a live CTA when a plan has no pricing option for the selected period', () => {
    // Money bug: getPriceForPeriod returns 0 cents (not undefined) when no
    // active pricing option matches the selected period's displayName. Every
    // fixture plan here only carries a "1 year" option, so selecting "3
    // years" must hide the price and the CTA rather than render "$0".
    const wrapper = mountPlans({
      selectedPeriod: unmatchedPeriod,
      availablePeriods: [period, unmatchedPeriod],
      radioValue: '3 years',
    })

    // .find() only matches nodes that actually exist in the rendered DOM
    // tree - a component that returns null instead of the button produces
    // no matching node, unlike e.g. a CSS-hidden element which .exists()
    // would still find. Confirmed on both fronts: no matching Node via
    // find(), and the raw HTML string doesn't contain the CTA's data-test
    // attribute either, ruling out "hidden but present in the DOM".
    expect(wrapper.find('[data-test="subscribe-essential"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="subscribe-advanced"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="subscribe-premium"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="subscribe-max"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('data-test="subscribe-essential"')
    expect(wrapper.html()).not.toContain('data-test="subscribe-advanced"')
    expect(wrapper.html()).not.toContain('data-test="subscribe-premium"')
    expect(wrapper.html()).not.toContain('data-test="subscribe-max"')

    expect(wrapper.text()).toContain('Not available on this billing term')
    expect(wrapper.text()).not.toContain('$0')
    expect(wrapper.text()).not.toMatch(/\$0(?!\d)/)
  })

  it('says so on the Max strip too, instead of quoting a price it has no option for', () => {
    const wrapper = mountPlans({
      selectedPeriod: unmatchedPeriod,
      availablePeriods: [period, unmatchedPeriod],
      radioValue: '3 years',
    })
    const strip = wrapper.find('[data-test="max-strip"]')
    expect(strip.exists()).toBe(true)
    expect(strip.find('.pro-strip__price').exists()).toBe(false)
    expect(strip.text()).toContain('Not available on this billing term')
    expect(strip.text()).not.toContain('$9,999')
  })

  it('never shows a bare "$" with a live CTA when no billing period is selected yet', () => {
    const wrapper = mountPlans({ selectedPeriod: null })

    expect(wrapper.find('[data-test="subscribe-essential"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="subscribe-advanced"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="subscribe-premium"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="subscribe-max"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('data-test="subscribe-essential"')
    expect(wrapper.html()).not.toContain('data-test="subscribe-max"')

    wrapper.findAll('.pro-card__price').forEach((price) => {
      expect(price.text()).not.toBe('$')
      expect(price.text()).not.toMatch(/^\$\d/)
    })

    // Distinct from the "plan exists but doesn't offer this term" case
    // (tested above with unmatchedPeriod): with NO period chosen at all,
    // nothing is known to be unavailable yet, so the cards must not claim
    // it is.
    expect(wrapper.text()).not.toContain('Not available on this billing term')
  })
})

describe('ProPlans period line', () => {
  // getPeriodDisplayName (src/lib/pricing.ts) only special-cases the legacy
  // '1 year'/'Yearly' display names; live period names like 'Annual' pass
  // straight through it unmodified, which used to produce the ungrammatical
  // "billed every annual". The period line in ProPlans.tsx must derive the
  // wording from periodMonths instead, without touching pricing.ts (shared
  // with PaymentPage).
  const makePlanForPeriod = (opt: PricingOption, cents = 100000): Plan =>
    ({
      id: 'period-fixture',
      tier: 'advanced',
      name: 'Medium',
      description: '',
      isActive: true,
      isDefault: false,
      displayOrder: 1,
      pricingOptions: [{ ...opt, priceCents: cents }],
      planRules: [],
    }) as unknown as Plan

  const advancedPeriodText = (wrapper: ReturnType<typeof mountPlans>) =>
    wrapper
      .findAll('.pro-card')
      .find((card) => card.find('.pro-card__tier').text() === 'Advanced')!
      .find('.pro-card__period')
      .text()

  it('reads "per year, billed annually" for a 12-month period, regardless of its display name', () => {
    const annual: PricingOption = {
      id: 'a',
      periodMonths: 12,
      priceCents: 0,
      displayName: 'Annual',
      isActive: true,
      displayOrder: 1,
    }
    const wrapper = mountPlans({
      plans: [makePlanForPeriod(annual)],
      selectedPeriod: annual,
      availablePeriods: [annual],
      radioValue: 'Annual',
    })
    expect(advancedPeriodText(wrapper)).toBe('per year, billed annually')
    expect(advancedPeriodText(wrapper)).not.toContain('billed every')
  })

  it('reads "per month, billed monthly" for a 1-month period', () => {
    const monthly: PricingOption = {
      id: 'm',
      periodMonths: 1,
      priceCents: 0,
      displayName: 'Monthly',
      isActive: true,
      displayOrder: 1,
    }
    const wrapper = mountPlans({
      plans: [makePlanForPeriod(monthly)],
      selectedPeriod: monthly,
      availablePeriods: [monthly],
      radioValue: 'Monthly',
    })
    expect(advancedPeriodText(wrapper)).toBe('per month, billed monthly')
  })

  it('sells a two-year term on the price lock rather than on a billing cadence', () => {
    const biennial: PricingOption = {
      id: 'b',
      periodMonths: 24,
      priceCents: 0,
      displayName: 'Biennial',
      isActive: true,
      displayOrder: 1,
    }
    const wrapper = mountPlans({
      plans: [makePlanForPeriod(biennial)],
      selectedPeriod: biennial,
      availablePeriods: [biennial],
      radioValue: 'Biennial',
    })
    expect(advancedPeriodText(wrapper)).toBe('for two years · price locked')
  })

  it('falls back to "billed every <display name>" for a term that is neither monthly nor whole years', () => {
    const quarterly: PricingOption = {
      id: 'q',
      periodMonths: 3,
      priceCents: 0,
      displayName: 'Quarterly',
      isActive: true,
      displayOrder: 1,
    }
    const wrapper = mountPlans({
      plans: [makePlanForPeriod(quarterly)],
      selectedPeriod: quarterly,
      availablePeriods: [quarterly],
      radioValue: 'Quarterly',
    })
    expect(advancedPeriodText(wrapper)).toBe('billed every quarterly')
  })
})

describe('ProPlans price-lock note', () => {
  // The live backend (getAvailablePeriods) may only offer Monthly + Annual,
  // with no multi-year term purchasable at all. The lock-note copy must be
  // data-driven off availablePeriods rather than asserting a longer term
  // unconditionally exists.
  const monthly: PricingOption = {
    id: 'm',
    periodMonths: 1,
    priceCents: 0,
    displayName: 'Monthly',
    isActive: true,
    displayOrder: 1,
  }
  const annual: PricingOption = {
    id: 'a',
    periodMonths: 12,
    priceCents: 0,
    displayName: 'Annual',
    isActive: true,
    displayOrder: 2,
  }
  const biennial: PricingOption = {
    id: 'b',
    periodMonths: 24,
    priceCents: 0,
    displayName: 'Biennial',
    isActive: true,
    displayOrder: 3,
  }

  // Two-term plans, so the two-year saving can be computed from real pricing
  // options exactly as the live page does: 2 x annual - biennial.
  const twoTermPlan = (id: string, name: string, annualCents: number, biennialCents: number): Plan =>
    ({
      id,
      tier: '',
      name,
      description: '',
      isActive: true,
      isDefault: false,
      displayOrder: 1,
      pricingOptions: [
        { ...annual, priceCents: annualCents },
        { ...biennial, priceCents: biennialCents },
      ],
      planRules: [],
    }) as unknown as Plan

  const twoTermPlans = [
    twoTermPlan('p1', 'Low', 99900, 179800),
    twoTermPlan('p2', 'Medium', 299900, 539800),
    twoTermPlan('p3', 'High', 499900, 899800),
  ]

  it('does not promise a longer term when only Monthly and Annual are available', () => {
    const wrapper = mountPlans({
      selectedPeriod: annual,
      availablePeriods: [monthly, annual],
      radioValue: 'Annual',
    })
    expect(wrapper.find('.pro-note').text()).toBe('Annual terms renew at the price published on the day of renewal.')
  })

  it('names the actual longer term available, even when it is not the one selected', () => {
    const wrapper = mountPlans({
      selectedPeriod: annual,
      availablePeriods: [monthly, annual, biennial],
      radioValue: 'Annual',
    })
    expect(wrapper.find('.pro-note').text()).toBe(
      'Annual terms renew at the price published on the day of renewal. ' +
        'A two-year term holds today’s price for the whole period.'
    )
  })

  it('quantifies the two-year saving from the real pricing options, not from hardcoded figures', () => {
    // 2 x $999 - $1,798 = $200; 2 x $2,999 - $5,398 = $600;
    // 2 x $4,999 - $8,998 = $1,000. Changing a backend price must change
    // this sentence, which a hardcoded string could not do.
    const wrapper = mountPlans({
      plans: twoTermPlans,
      selectedPeriod: biennial,
      availablePeriods: [annual, biennial],
      radioValue: 'Biennial',
    })
    expect(wrapper.find('.pro-note').text()).toBe(
      'Two-year terms hold the price for the full period: $200 less than two Essential renewals, ' +
        '$600 less on Advanced, $1,000 less on Premium.'
    )
  })

  it('falls back to the qualitative price-lock wording when the saving cannot be computed', () => {
    // Fixture plans only carry a "Biennial" option here, so there is no
    // annual price to compare against - the note must not invent one.
    const biennialOnly = [
      {
        ...twoTermPlan('p2', 'Medium', 0, 539800),
        pricingOptions: [{ ...biennial, priceCents: 539800 }],
      } as unknown as Plan,
    ]
    const wrapper = mountPlans({
      plans: biennialOnly,
      selectedPeriod: biennial,
      availablePeriods: [biennial],
      radioValue: 'Biennial',
    })
    expect(wrapper.find('.pro-note').text()).toBe(
      'Two-year terms hold the price for the full period — the price you sign at is the price you renew at.'
    )
  })
})

describe('groupThousands', () => {
  it('adds separators to the integer part only', () => {
    expect(groupThousands('2999')).toBe('2,999')
    expect(groupThousands('999')).toBe('999')
    expect(groupThousands('1234567')).toBe('1,234,567')
    expect(groupThousands('2999.50')).toBe('2,999.50')
    expect(groupThousands('0')).toBe('0')
  })

  it('does not corrupt the decimal part of a price', () => {
    expect(groupThousands('2999.50')).toBe('2,999.50')
    expect(groupThousands('2999.50')).not.toBe('2,9,9,9.50')
    expect(groupThousands('1000000.99')).toBe('1,000,000.99')
  })
})
