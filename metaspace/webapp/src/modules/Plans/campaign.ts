import type { ProTier } from './proContent'

export type CampaignTerm = 'YEARLY' | 'TWO_YEARS' | 'DATASET_PACK'

export interface CampaignCode {
  /** essential | advanced | premium | max, or null for the dataset pack */
  tier: string | null
  term: CampaignTerm
  code: string
  percent: number
}

export interface BlackFridayCampaign {
  start: string
  end: string
  headlinePercent: number
  codes: CampaignCode[]
  /** True from `renameAt` on: the same campaign is then shown as the "Year-end offer". */
  renamed?: boolean
}

/** The words the campaign is shown with. Codes, rates, prices and the end date never depend on them. */
export interface CampaignLabels {
  /** Banner and callout name. */
  name: string
  /** Label above the code in a coupon box. */
  coupon: string
  /** Start of a sentence about the codes. */
  codes: string
  /** Mid-sentence mention of one code. */
  code: string
}

const BLACK_FRIDAY_LABELS: { before: CampaignLabels; after: CampaignLabels } = {
  before: { name: 'Black Friday', coupon: 'BLACK FRIDAY CODE', codes: 'Black Friday codes', code: 'Black Friday code' },
  after: { name: 'Year-end offer', coupon: 'YEAR-END', codes: 'Year-end codes', code: 'year-end code' },
}

export const campaignLabels = (blackFriday: BlackFridayCampaign): CampaignLabels =>
  blackFriday.renamed ? BLACK_FRIDAY_LABELS.after : BLACK_FRIDAY_LABELS.before

export interface CyberMondayCampaign {
  start: string
  end: string
  passDays: number
  activationTurnaroundDays: number | null
}

/** One-off seasonal campaigns, hardcoded: only the Pro page reads them. Dates are inclusive and in UTC. */
export const CAMPAIGNS: {
  blackFriday: BlackFridayCampaign & { renameAt: string }
  cyberMonday: CyberMondayCampaign
} = {
  blackFriday: {
    start: '2026-11-27T00:00:00Z',
    end: '2026-12-31T23:59:59Z',
    // From this moment the campaign is displayed as the "Year-end offer"; nothing else about it changes.
    renameAt: '2026-12-14T00:00:00Z',
    headlinePercent: 50,
    codes: [
      { tier: 'essential', term: 'YEARLY', code: 'ESSENTIALPROMO1', percent: 50 },
      { tier: 'advanced', term: 'YEARLY', code: 'ADVANCEDPROMO1', percent: 40 },
      { tier: 'premium', term: 'YEARLY', code: 'PREMIUMPROMO1', percent: 35 },
      { tier: 'max', term: 'YEARLY', code: 'MAXPROMO1', percent: 30 },
      { tier: 'essential', term: 'TWO_YEARS', code: 'ESSENTIALPROMO2', percent: 40 },
      { tier: 'advanced', term: 'TWO_YEARS', code: 'ADVANCEDPROMO2', percent: 30 },
      { tier: 'premium', term: 'TWO_YEARS', code: 'PREMIUMPROMO2', percent: 25 },
      { tier: 'max', term: 'TWO_YEARS', code: 'MAXPROMO2', percent: 20 },
      { tier: null, term: 'DATASET_PACK', code: 'PACKPROMO6', percent: 15 },
    ],
  },
  cyberMonday: {
    start: '2026-11-30T00:00:00Z',
    end: '2026-12-13T23:59:59Z',
    passDays: 30,
    activationTurnaroundDays: null,
  },
}

const isLive = (campaign: { start: string; end: string }, now: Date): boolean =>
  now.getTime() >= Date.parse(campaign.start) && now.getTime() <= Date.parse(campaign.end)

/** The Black Friday campaign as it is displayed at `now`: under its own name, or renamed from `renameAt` on. */
export const blackFridayAt = (now: Date): BlackFridayCampaign => {
  const { renameAt, ...campaign } = CAMPAIGNS.blackFriday
  return { ...campaign, renamed: now.getTime() >= Date.parse(renameAt) }
}

/** The campaigns whose window contains `now`, boundaries included; null for the others. */
export const getActiveCampaigns = (
  now: Date
): { blackFriday: BlackFridayCampaign | null; cyberMonday: CyberMondayCampaign | null } => ({
  blackFriday: isLive(CAMPAIGNS.blackFriday, now) ? blackFridayAt(now) : null,
  cyberMonday: isLive(CAMPAIGNS.cyberMonday, now) ? CAMPAIGNS.cyberMonday : null,
})

export interface ClaimOption {
  key: string
  label: string
}

/** Allowed answers of the Cyber Monday claim form. */
export const CLAIM_OPTIONS: Record<'role' | 'today' | 'next', ClaimOption[]> = {
  role: [
    { key: 'pi', label: 'PI / group leader' },
    { key: 'postdoc', label: 'Postdoc / staff scientist' },
    { key: 'phd', label: 'PhD student' },
    { key: 'core_facility', label: 'Core facility / platform staff' },
    { key: 'industry', label: 'Industry scientist' },
    { key: 'other', label: 'Other' },
  ],
  today: [
    { key: 'metaspace', label: 'I use METASPACE' },
    { key: 'own_scripts', label: 'Export and analyse with our own scripts (R, Python)' },
    { key: 'other_software', label: 'Export and analyse in other software' },
    { key: 'collaborator', label: 'A collaborator or core facility does the analysis' },
    { key: 'images_only', label: 'Mostly look at the images — little analysis beyond annotation' },
  ],
  next: [
    { key: 'pathway', label: 'Pathway analysis' },
    { key: 'histology', label: 'Histology overlay' },
    { key: 'multi_omics', label: 'Multi-omics integration' },
    { key: 'cell_type', label: 'Cell-type analysis' },
  ],
}

/** Campaign term for a billing period in months: 12 is yearly, 24 is two years, anything else has no codes. */
export const termForMonths = (months: number | null | undefined): 'YEARLY' | 'TWO_YEARS' | null => {
  if (months === 12) {
    return 'YEARLY'
  }
  if (months === 24) {
    return 'TWO_YEARS'
  }
  return null
}

export const findCode = (
  bf: BlackFridayCampaign | null,
  tier: ProTier | null,
  term: CampaignTerm | null
): CampaignCode | null => {
  if (!bf || !tier || !term) {
    return null
  }
  return bf.codes.find((code) => code.tier === tier && code.term === term) || null
}

export const packCode = (bf: BlackFridayCampaign | null): CampaignCode | null =>
  bf?.codes.find((code) => code.term === 'DATASET_PACK') || null

/**
 * The Black Friday code a plan shows, and the checkout link carries: a tier code for the selected term, or the pack
 * code for the dataset pack. Null when no campaign is live, the plan is missing or already the visitor's, or it has
 * no price for the selected term.
 */
export const couponFor = (
  bf: BlackFridayCampaign | null,
  kind: ProTier | 'pack',
  term: CampaignTerm | null,
  plan: { id: string } | null | undefined,
  hasPrice: boolean,
  activePlanId: string | null
): CampaignCode | null => {
  if (!bf || !plan || !hasPrice || plan.id === activePlanId) {
    return null
  }
  return kind === 'pack' ? packCode(bf) : findCode(bf, kind, term)
}

export const discountedCents = (priceCents: number, percent: number): number =>
  Math.round((priceCents * (100 - percent)) / 100)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "31 Dec" or "31 Dec 2026", in UTC. */
export const formatCampaignDate = (iso: string, withYear: boolean): string => {
  const date = new Date(iso)
  const text = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
  return withYear ? `${text} ${date.getUTCFullYear()}` : text
}

export interface ClaimMessageForm {
  organisation: string
  role: string
  today: string
  next: string[]
  wish: string
}

/** The message is sent as an HTML email body, so user-typed text must not be read as markup. */
export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const optionLabel = (options: ClaimOption[], key: string): string => options.find((o) => o.key === key)?.label || '-'

/** Body of the claim email: one `Label: value` line per answer (joined with `<br>`), option labels instead of keys. */
export const buildClaimMessage = (form: ClaimMessageForm): string => {
  const next = CLAIM_OPTIONS.next.filter((o) => form.next.includes(o.key)).map((o) => o.label)
  return [
    'Cyber Monday free month claim',
    `Institution or company: ${escapeHtml(form.organisation.trim()) || '-'}`,
    `Role: ${optionLabel(CLAIM_OPTIONS.role, form.role)}`,
    `Analyses annotations today: ${optionLabel(CLAIM_OPTIONS.today, form.today)}`,
    `Wants next: ${next.join('; ') || '-'}`,
    `Something else: ${escapeHtml(form.wish.trim()) || '-'}`,
    'Agreed to Terms and Privacy policy: yes',
  ].join('<br>\n')
}
