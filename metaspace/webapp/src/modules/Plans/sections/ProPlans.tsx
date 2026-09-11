import { computed, defineComponent, PropType } from 'vue'
import { ElRadioButton, ElRadioGroup, ElSkeleton, ElSkeletonItem } from '../../../lib/element-plus'
import { RouterLink } from 'vue-router'
import type { Plan, PricingOption } from '../../../api/plan'
import { formatPrice, getPeriodDisplayName, getPricingOptionForPeriod, getPriceForPeriod } from '../../../lib/pricing'
import {
  bulletText,
  CARD_TIERS,
  COMPARISON_GROUPS,
  PRO_FLAGS,
  ProTier,
  resolveTier,
  TierBullet,
  TIER_SPECS,
} from '../proContent'
import { scrollToHashSection } from '../scrollToSection'

const ALL_TIERS: ProTier[] = ['free', 'essential', 'advanced', 'premium', 'max']

// `formatPrice` converts cents to dollars but emits no thousands separator,
// so an Advanced plan renders as "2999". The commercial layout needs "2,999".
// Group only the integer part so "29.99" is left alone.
export const groupThousands = (value: string): string => {
  const [whole, fraction] = value.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction ? `${grouped}.${fraction}` : grouped
}

// Multi-year copy reads as words ("two-year term", "two Essential renewals"),
// never as digits. Falls back to the numeral for terms long enough that no
// one has written the word out.
const YEAR_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' }
const yearsWord = (months: number): string => {
  const years = Math.round(months / 12)
  return YEAR_WORDS[years] || String(years)
}

/** "two-year" / "three-year", or "multi-year" for a term that isn't whole years. */
const termWord = (months: number): string => (months % 12 === 0 ? `${yearsWord(months)}-year` : 'multi-year')

const sentenceCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

export default defineComponent({
  name: 'ProPlans',
  props: {
    plans: { type: Array as PropType<Plan[]>, default: () => [] },
    loading: { type: Boolean, default: false },
    selectedPeriod: { type: Object as PropType<PricingOption | null>, default: null },
    availablePeriods: { type: Array as PropType<PricingOption[]>, default: () => [] },
    radioValue: { type: String, default: '' },
    activePlanId: { type: String as PropType<string | null>, default: null },
    packPlan: { type: Object as PropType<Plan | null>, default: null },
  },
  emits: ['subscribe', 'period', 'buyPack'],
  setup(props, { emit }) {
    const byTier = computed(() => {
      const map: Partial<Record<ProTier, Plan>> = {}
      ;[...props.plans]
        .filter((plan) => plan.isActive)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .forEach((plan) => {
          const tier = resolveTier(plan)
          if (tier && !map[tier]) {
            map[tier] = plan
          }
        })
      return map
    })

    const pricingOptionFor = (tier: ProTier): PricingOption | null => {
      const plan = byTier.value[tier]
      if (!plan || !props.selectedPeriod) {
        return null
      }
      return getPricingOptionForPeriod(plan, props.selectedPeriod) || null
    }

    const priceFor = (tier: ProTier): string | null => {
      const plan = byTier.value[tier]
      if (!plan || !props.selectedPeriod || !pricingOptionFor(tier)) {
        return null
      }
      return groupThousands(formatPrice(getPriceForPeriod(plan, props.selectedPeriod)))
    }

    const periodLabel = computed(() => {
      const period = props.selectedPeriod
      if (!period) {
        return ''
      }
      const months = period.periodMonths || 12
      if (months === 12) {
        return 'billed annually'
      }
      if (months === 1) {
        return 'billed monthly'
      }
      return `billed every ${getPeriodDisplayName(period).toLowerCase()}`
    })

    const periodLine = computed(() => {
      const period = props.selectedPeriod
      if (!period) {
        return ''
      }
      const months = period.periodMonths || 12
      if (months > 12 && months % 12 === 0) {
        return `for ${yearsWord(months)} years · price locked`
      }
      if (months === 12) {
        return `per year, ${periodLabel.value}`
      }
      if (months === 1) {
        return `per month, ${periodLabel.value}`
      }
      return periodLabel.value
    })

    // The Max strip shows its price inline, so it needs the short form of the
    // same idea ("a year" / "for two years") rather than the card's full line.
    const inlinePeriodNote = computed(() => {
      const period = props.selectedPeriod
      if (!period) {
        return ''
      }
      const months = period.periodMonths || 12
      if (months > 12 && months % 12 === 0) {
        return `for ${yearsWord(months)} years`
      }
      if (months === 12) {
        return 'a year'
      }
      if (months === 1) {
        return 'a month'
      }
      return periodLabel.value
    })

    // The shortest multi-year term actually purchasable, derived from the real
    // available periods rather than assumed: the backend may only offer
    // Monthly + Annual (as it does in dev), in which case the price-lock
    // sentence must not render, since there is nothing for it to describe.
    const multiYearOption = computed(
      () =>
        [...props.availablePeriods]
          .filter((option) => (option.periodMonths || 0) > 12)
          .sort((a, b) => a.periodMonths - b.periodMonths)[0] || null
    )

    // What a multi-year term actually saves, computed from the live pricing
    // options rather than hardcoded: (annual price x terms) - multi-year
    // price, per card tier. Hardcoding these figures would let the page
    // advertise a saving the backend no longer offers the moment a price
    // changes. Returns null when the arithmetic can't be done from real data.
    const savingsClause = computed<string | null>(() => {
      const period = props.selectedPeriod
      const months = period?.periodMonths || 0
      if (!period || months <= 12 || months % 12 !== 0) {
        return null
      }
      const annual = props.availablePeriods.find((option) => option.periodMonths === 12)
      if (!annual) {
        return null
      }
      const terms = months / 12
      const clauses: string[] = []
      CARD_TIERS.forEach((tier) => {
        const plan = byTier.value[tier]
        if (!plan) {
          return
        }
        const longOption = getPricingOptionForPeriod(plan, period)
        const annualOption = getPricingOptionForPeriod(plan, annual)
        if (!longOption || !annualOption) {
          return
        }
        const savingCents = annualOption.priceCents * terms - longOption.priceCents
        if (savingCents <= 0) {
          return
        }
        const amount = `$${groupThousands(formatPrice(savingCents))}`
        clauses.push(
          clauses.length === 0
            ? `${amount} less than ${yearsWord(months)} ${TIER_SPECS[tier].label} renewals`
            : `${amount} less on ${TIER_SPECS[tier].label}`
        )
      })
      return clauses.length > 0 ? clauses.join(', ') : null
    })

    const lockNote = computed(() => {
      const months = props.selectedPeriod?.periodMonths || 0
      if (months > 12) {
        const term = sentenceCase(termWord(months))
        return savingsClause.value
          ? `${term} terms hold the price for the full period: ${savingsClause.value}.`
          : `${term} terms hold the price for the full period — the price you sign at is the price you renew at.`
      }
      const longer = multiYearOption.value
      if (longer) {
        return (
          'Annual terms renew at the price published on the day of renewal. ' +
          `A ${termWord(longer.periodMonths)} term holds today’s price for the whole period.`
        )
      }
      return 'Annual terms renew at the price published on the day of renewal.'
    })

    const packPriceText = computed(() => {
      const priceCents = props.packPlan?.pricingOptions?.find((option) => option.isActive)?.priceCents
      return priceCents != null ? `$${groupThousands(formatPrice(priceCents))}` : '$350'
    })

    const renderBullet = (bullet: TierBullet) =>
      bullet.map((segment, index) => {
        const key = `${index}-${segment.text}`
        if (segment.style === 'strong') {
          return <b key={key}>{segment.text}</b>
        }
        if (segment.style === 'em') {
          return <em key={key}>{segment.text}</em>
        }
        return <span key={key}>{segment.text}</span>
      })

    // No live checkout button without a real, backend-priced offer for the
    // selected billing term: neither when the plan is missing entirely, nor
    // when the plan exists but doesn't offer this period (pricingOptionFor
    // returns null), nor when no period is selected at all.
    const renderCta = (tier: ProTier, testId: string, block = true) => {
      const plan = byTier.value[tier]
      if (!plan) {
        return null
      }
      const width = block ? ' pro-btn--block' : ''
      if (props.activePlanId === plan.id) {
        return (
          <div class={`pro-btn pro-btn--ghost${width} !px-0`} style={{ cursor: 'default' }}>
            Already enjoying the benefits!
          </div>
        )
      }
      if (!pricingOptionFor(tier)) {
        return null
      }
      const highlight = TIER_SPECS[tier].highlight
      return (
        <button
          type="button"
          data-test={testId}
          data-cta={`plans-subscribe-${tier}`}
          data-cta-destination="/payment"
          class={`pro-btn${width} ${highlight ? 'pro-btn--accent' : 'pro-btn--ghost'}`}
          onClick={() => emit('subscribe', plan.id)}
        >
          Choose {TIER_SPECS[tier].label}
        </button>
      )
    }

    const renderCards = () =>
      CARD_TIERS.filter((tier) => byTier.value[tier]).map((tier) => {
        const spec = TIER_SPECS[tier]
        const price = priceFor(tier)
        return (
          <div class={`pro-card ${spec.highlight ? 'pro-card--highlight' : ''}`} key={tier}>
            {spec.highlight && <span class="pro-card__badge">MOST CHOSEN</span>}
            <p class="pro-card__tier">{spec.label}</p>
            {price ? (
              <>
                <p class="pro-card__price">
                  <sup>$</sup>
                  {price}
                </p>
                <p class="pro-card__period">{periodLine.value}</p>
              </>
            ) : props.selectedPeriod ? (
              // A period IS selected but this plan doesn't offer it - genuinely
              // unavailable. Distinct from no period being chosen yet (below),
              // where nothing is known to be unavailable.
              <p class="pro-card__price pro-card__price--unavailable">Not available on this billing term</p>
            ) : null}
            <p class="pro-card__blurb">{spec.blurb}</p>
            <ul class="pro-card__bullets">
              {spec.bullets.map((bullet) => (
                <li key={bulletText(bullet)}>{renderBullet(bullet)}</li>
              ))}
            </ul>
            <div class="pro-card__cta">{renderCta(tier, `subscribe-${tier}`)}</div>
          </div>
        )
      })

    const renderMaxStrip = () => {
      if (!byTier.value.max) {
        return null
      }
      const price = priceFor('max')
      return (
        <div class="pro-strip pro-strip--max" data-test="max-strip" style={{ marginTop: '14px' }}>
          <div class="pro-strip__body">
            <h3 class="pro-h3 pro-strip__heading">
              <span>{TIER_SPECS.max.label}</span>
              {price ? (
                <>
                  <span class="pro-strip__price">${price}</span>
                  <span class="pro-strip__price-note">{inlinePeriodNote.value}</span>
                </>
              ) : props.selectedPeriod ? (
                <span class="pro-strip__price-note">Not available on this billing term</span>
              ) : null}
            </h3>
            <p class="pro-strip__copy">{TIER_SPECS.max.blurb}</p>
          </div>
          <div class="pro-strip__actions">
            {renderCta('max', 'subscribe-max', false)}
            <a
              href="/contact"
              class="pro-strip__link"
              data-test="request-quote"
              data-cta="plans-request-quote"
              target="_blank"
              rel="noopener noreferrer"
            >
              Need more volume? →
            </a>
          </div>
        </div>
      )
    }

    const renderTable = () => (
      <div class="pro-table-wrap">
        <table class="pro-table">
          <thead>
            <tr>
              <th />
              {ALL_TIERS.map((tier) => (
                <th key={tier} class={TIER_SPECS[tier].highlight ? 'is-highlight' : ''}>
                  {TIER_SPECS[tier].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_GROUPS.map((group) => [
              <tr class="pro-table__group" key={group.title}>
                <th colspan={ALL_TIERS.length + 1}>{group.title}</th>
              </tr>,
              ...group.rows.map((row) => (
                <tr key={`${group.title}-${row.name}`}>
                  <th>{row.name}</th>
                  {ALL_TIERS.map((tier) => {
                    const value = row.value(tier)
                    const isEmpty = value === '—'
                    return (
                      <td
                        key={tier}
                        class={[row.accent && !isEmpty ? 'is-accent' : '', isEmpty ? 'is-empty' : ''].join(' ')}
                      >
                        {value}
                      </td>
                    )
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    )

    return () => (
      <section id="plans" class="pro-section pro-section--tint">
        <div class="pro-shell">
          <p class="pro-eyebrow pro-eyebrow--accent">Plans</p>
          <h2 class="pro-h2" style={{ maxWidth: '24ch' }}>
            Priced by how much private work you do
          </h2>
          <p class="pro-lede" style={{ marginBottom: '32px' }}>
            Every plan includes all downstream analysis tools, unlimited group members and unlimited projects. What
            changes is how many private datasets you can run them on. Prices exclude VAT and applicable taxes.{' '}
            <RouterLink to="/split">How Academic and Pro differ →</RouterLink>
          </p>

          <div class="pro-billing-toggle">
            {props.loading ? (
              <ElSkeleton animated>
                <ElSkeletonItem style={{ width: '200px', height: '40px' }} />
              </ElSkeleton>
            ) : (
              <ElRadioGroup
                modelValue={props.radioValue}
                onChange={(value: string) => emit('period', value)}
                size="large"
              >
                {props.availablePeriods.map((option) => (
                  // `label` stays the raw backend displayName because it is
                  // the radio's VALUE - the parent looks the period up by it.
                  // The price-lock suffix is decoration in the slot only.
                  <ElRadioButton key={option.id} label={option.displayName}>
                    {(option.periodMonths || 0) > 12 ? `${option.displayName} · price locked` : option.displayName}
                  </ElRadioButton>
                ))}
              </ElRadioGroup>
            )}
          </div>

          <div class="pro-strip" style={{ marginBottom: '22px' }}>
            <div class="pro-strip__body">
              <h3 class="pro-h3">Free — included with every METASPACE account</h3>
              <p class="pro-strip__copy">
                {TIER_SPECS.free.bullets.map((bullet, index) => (
                  <span key={bulletText(bullet)}>
                    {index > 0 && ' · '}
                    {renderBullet(bullet)}
                  </span>
                ))}
              </p>
            </div>
            <a
              href="/upload"
              target="_blank"
              rel="noopener noreferrer"
              class="pro-btn pro-btn--ghost"
              data-cta="plans-upload-free"
            >
              Submit your first private dataset
            </a>
          </div>

          {props.loading ? (
            <div class="pro-cards">
              {Array.from({ length: CARD_TIERS.length }).map((_, index) => (
                <ElSkeleton animated key={`skeleton-${index}`}>
                  <ElSkeletonItem style={{ width: '100%', height: '360px' }} />
                </ElSkeleton>
              ))}
            </div>
          ) : Object.keys(byTier.value).length === 0 ? (
            <div class="pro-strip">
              <div class="pro-strip__body">
                <h3 class="pro-h3">Plans are temporarily unavailable</h3>
                <p class="pro-strip__copy">
                  We could not load pricing just now. Please refresh, or{' '}
                  <a href="/contact" data-cta="plans-error-contact">
                    get in touch
                  </a>{' '}
                  and we&apos;ll send you a quote directly.
                </p>
              </div>
            </div>
          ) : (
            <div class="pro-cards">{renderCards()}</div>
          )}

          <p class="pro-note" style={{ marginTop: '14px' }}>
            {lockNote.value}
          </p>

          {!props.loading && renderMaxStrip()}

          {PRO_FLAGS.datasetPack && (
            <div class="pro-datapack" style={{ marginTop: '14px' }}>
              <div class="pro-datapack__body">
                <p class="pro-datapack__title">
                  Dataset pack — no subscription <span class="pro-datapack__price">{packPriceText.value}</span>
                </p>
                <p class="pro-datapack__copy">
                  10 private datasets, valid 6 months from purchase, all downstream analysis tools included. One-off
                  payment — nothing renews.
                </p>
              </div>
              {props.packPlan ? (
                <button
                  type="button"
                  class="pro-btn pro-btn--ghost pro-btn--sm"
                  data-test="buy-dataset-pack"
                  data-cta="plans-buy-pack"
                  data-cta-destination="/payment"
                  onClick={() => emit('buyPack', props.packPlan!.id)}
                >
                  Buy a pack
                </button>
              ) : (
                <a
                  href="#procurement"
                  class="pro-btn pro-btn--ghost pro-btn--sm"
                  data-test="buy-dataset-pack"
                  data-cta="plans-buy-pack"
                  onClick={(e: MouseEvent) => scrollToHashSection(e, '#procurement')}
                >
                  Buy a pack
                </a>
              )}
            </div>
          )}

          {!props.loading && renderTable()}
          <p class="pro-note" style={{ marginTop: '14px' }}>
            * The download of raw dataset files is limited to 2 datasets per day.
          </p>
          <p class="pro-seatnote">
            <b>No per-seat pricing, on any plan.</b> Unlimited group members and unlimited projects, including on Free.
            You pay for private throughput, never for people.
          </p>
        </div>
      </section>
    )
  },
})
