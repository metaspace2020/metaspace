import type { Plan } from '../../api/plan'

export type ProTier = 'free' | 'essential' | 'advanced' | 'premium' | 'max'

// Backend plans are still named Low/Medium/High/Ultra. Display names are
// remapped here so no migration or backend deploy is needed, and so the page
// keeps working if the DB is renamed later.
const TIER_ALIASES: Record<ProTier, string[]> = {
  free: ['free'],
  essential: ['essential', 'bench', 'low'],
  advanced: ['advanced', 'lab', 'medium'],
  premium: ['premium', 'facility', 'high'],
  max: ['max', 'institute', 'ultra'],
}

const TIER_ORDER: ProTier[] = ['free', 'essential', 'advanced', 'premium', 'max']

// Plan identity must be resolved from `plan.name` FIRST. In the real dev/
// production database, `plan.tier` is a coarse billing category
// ('free' | 'standard' | 'premium'), not the plan identity - e.g. the "Low"
// plan (which should render as Essential) carries tier "free", which would
// otherwise misresolve it as the Free tier. Note that 'premium' is now BOTH
// a new display name (the third card tier) AND a value the backend `tier`
// column can hold for the coarse category shared by "High" and "Ultra" -
// e.g. plan.name "Ultra" can carry plan.tier "premium". Name-first resolution
// is what keeps "Ultra"/tier "premium" resolving to `max` instead of
// `premium`. `tier` is only trustworthy as a fallback for plans whose name
// doesn't match any alias at all.
export const resolveTier = (plan: Plan): ProTier | null => {
  const name = (plan?.name || '').toLowerCase().trim()
  if (name) {
    const tokens = name.split(/[^a-z0-9]+/).filter(Boolean)
    const byName = TIER_ORDER.find((key) => TIER_ALIASES[key].some((alias) => tokens.includes(alias)))
    if (byName) {
      return byName
    }
  }
  const tier = (plan?.tier || '').toLowerCase().trim()
  if (!tier) {
    return null
  }
  return TIER_ORDER.find((key) => TIER_ALIASES[key].includes(tier)) || null
}

// Feature bullets carry inline emphasis (the allowance number is bold ink
// inside an otherwise muted line; the Free summary italicises "on those
// datasets"), so they are modelled as segment lists rather than plain strings.
// Rendering the markup from data keeps the copy in one place instead of
// splitting each sentence across proContent and the JSX.
export interface BulletSegment {
  text: string
  /** 'strong' renders a <b> in ink; 'em' renders an <em>. */
  style?: 'strong' | 'em'
}

export type TierBullet = BulletSegment[]

/** Flattens a bullet back to plain text, for aria labels, keys and tests. */
export const bulletText = (bullet: TierBullet): string => bullet.map((segment) => segment.text).join('')

export interface TierSpec {
  label: string
  blurb: string
  bullets: TierBullet[]
  datasets: string
  reprocessings: string
  supportChannels: string
  supportResponse: string
  training: string
  earlyAccess: string
  crossDataset: string
  highlight?: boolean
}

export const TIER_SPECS: Record<ProTier, TierSpec> = {
  free: {
    label: 'Free',
    blurb: 'Included with every METASPACE account.',
    // Rendered joined with " · " in the Free strip, so these read as clauses
    // of one sentence rather than as card bullets.
    bullets: [
      [{ text: '3 private datasets a year' }],
      [{ text: '6 reprocessings' }],
      [{ text: 'all three analysis tools ' }, { text: 'on those datasets', style: 'em' }],
      [{ text: 'email support in 3 working days' }],
    ],
    datasets: '3',
    reprocessings: '6',
    supportChannels: 'Email',
    supportResponse: '3 working days',
    training: '—',
    earlyAccess: '—',
    // Cross-dataset statistics are scoped by experiment, not by dataset: the
    // Free allowance covers your first three experiments. The two rows above
    // it (ROI, segmentation) are per-dataset and keep saying "datasets".
    crossDataset: 'On your first 3 experiments',
  },
  essential: {
    label: 'Essential',
    blurb: 'For occasional private work running alongside your published projects.',
    bullets: [
      [{ text: '30', style: 'strong' }, { text: ' private datasets a year' }],
      [{ text: '60', style: 'strong' }, { text: ' reprocessings a year' }],
      [{ text: 'Email support in 2 working days' }],
    ],
    datasets: '30',
    reprocessings: '60',
    supportChannels: 'Email',
    supportResponse: '2 working days',
    training: '—',
    earlyAccess: '—',
    crossDataset: 'Included',
  },
  advanced: {
    label: 'Advanced',
    blurb: 'For steady private throughput, with several people submitting regularly.',
    bullets: [
      [{ text: '100', style: 'strong' }, { text: ' private datasets a year' }],
      [{ text: '200', style: 'strong' }, { text: ' reprocessings a year' }],
      [{ text: 'Email support within 24 hours' }],
      [{ text: 'Training on core functionality' }],
      [{ text: 'Limited early feature access' }],
    ],
    datasets: '100',
    reprocessings: '200',
    supportChannels: 'Email',
    supportResponse: '24 hours',
    training: 'Core functionality',
    earlyAccess: 'Limited',
    crossDataset: 'Included',
    highlight: true,
  },
  premium: {
    label: 'Premium',
    blurb: 'For continuous private work, including client work under confidentiality.',
    bullets: [
      [{ text: '300', style: 'strong' }, { text: ' private datasets a year' }],
      [{ text: '600', style: 'strong' }, { text: ' reprocessings a year' }],
      [{ text: '24-hour email + bookable live chat' }],
      [{ text: 'Training on advanced functionality' }],
      [{ text: 'Full early feature access' }],
    ],
    datasets: '300',
    reprocessings: '600',
    supportChannels: 'Email + live chat',
    supportResponse: '24 hours; chat within 24h',
    training: 'Advanced functionality',
    earlyAccess: 'Full',
    crossDataset: 'Included',
  },
  max: {
    label: 'Max',
    blurb:
      '1,000+ private datasets, 12-hour email response, same-day chat, end-to-end personalised ' +
      'training and input on the roadmap.',
    // Max renders as a full-width strip, which shows the blurb rather than a
    // bullet list. These stay so Max keeps a complete TierSpec and can be
    // rendered as a card again without re-authoring its copy.
    bullets: [
      [{ text: '1,000+', style: 'strong' }, { text: ' private datasets a year' }],
      [{ text: '2,000+', style: 'strong' }, { text: ' reprocessings a year' }],
      [{ text: '12-hour email; chat same day' }],
      [{ text: 'End-to-end personalised training' }],
      [{ text: 'Full early access + roadmap input' }],
    ],
    datasets: '1,000+',
    reprocessings: '2,000+',
    supportChannels: 'Email + live chat',
    supportResponse: '12 hours; chat same day',
    training: 'End-to-end, personalised',
    earlyAccess: 'Full + roadmap input',
    crossDataset: 'Included',
  },
}

// Tiers rendered as cards in the pricing grid - Essential, Advanced and
// Premium ONLY. Free and Max are full-width strips that bracket the grid
// (Free above it, Max below the lock note), so neither belongs here. `max`
// remains a fully supported ProTier everywhere else: resolveTier still
// resolves it, TIER_SPECS still describes it and the comparison table still
// has a Max column. Only the
// card grid excludes it - adding it back here would render Max as a fourth
// card and break the three-column layout the design specifies.
export const CARD_TIERS: ProTier[] = ['essential', 'advanced', 'premium']

export interface ComparisonRow {
  name: string
  value: (tier: ProTier) => string
  accent?: boolean
}

export interface ComparisonGroup {
  title: string
  rows: ComparisonRow[]
}

const unlimited = () => 'Unlimited'
const yes = () => 'Yes'

export const COMPARISON_GROUPS: ComparisonGroup[] = [
  {
    title: 'Analysis — on every plan, within your private dataset allowance',
    rows: [
      {
        name: 'ROI differential analysis',
        value: (t) => (t === 'free' ? 'On your 3 datasets' : 'Included'),
        accent: true,
      },
      { name: 'Spatial segmentation', value: (t) => (t === 'free' ? 'On your 3 datasets' : 'Included'), accent: true },
      { name: 'Cross-dataset statistics', value: (t) => TIER_SPECS[t].crossDataset, accent: true },
    ],
  },
  {
    title: 'Privacy & scale',
    rows: [
      { name: 'Private datasets per year', value: (t) => TIER_SPECS[t].datasets },
      { name: 'Private reprocessings per year', value: (t) => TIER_SPECS[t].reprocessings },
      { name: 'Group members', value: unlimited },
      { name: 'Projects', value: unlimited },
      { name: 'Export results any time*', value: yes, accent: true },
    ],
  },
  {
    title: 'Support',
    rows: [
      { name: 'Channels', value: (t) => TIER_SPECS[t].supportChannels },
      { name: 'Response time', value: (t) => TIER_SPECS[t].supportResponse },
      { name: 'Dedicated training', value: (t) => TIER_SPECS[t].training },
      { name: 'Early feature access', value: (t) => TIER_SPECS[t].earlyAccess },
    ],
  },
  {
    title: 'Commercial',
    rows: [
      { name: 'Purchase order & invoice', value: (t) => (t === 'free' ? '—' : 'Yes'), accent: true },
      { name: 'Multi-year price lock', value: (t) => (t === 'free' ? '—' : 'Yes'), accent: true },
    ],
  },
]

// Sections whose copy is not yet verified against a real source. All true
// during development so the full page renders; flip to false before launch if
// the copy has not been confirmed by then.
export const PRO_FLAGS = {
  // "10 private datasets for $350" - not implemented in checkout yet.
  datasetPack: true,
  // 90-day quote validity - unconfirmed.
  procurementDetail: true,
}
