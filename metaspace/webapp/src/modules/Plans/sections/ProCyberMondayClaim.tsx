import { computed, defineComponent, nextTick, PropType, reactive, ref, VNode, watch } from 'vue'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { scrollToHashSection } from '../scrollToSection'
import { prefersReducedMotion } from '../charts/drawing'
import { currentUserEmailRoleQuery, sendContactMessageMutation } from '../../../api/user'
import {
  BlackFridayCampaign,
  buildClaimMessage,
  campaignLabels,
  escapeHtml,
  CLAIM_OPTIONS,
  ClaimOption,
  CyberMondayCampaign,
  formatCampaignDate,
} from '../campaign'

type TextField = 'email' | 'organisation'
type SelectField = 'role' | 'today'
type FieldName = TextField | 'role' | 'terms'
/** Required controls, in page order: the first one with an error gets focus. */
const REQUIRED_ORDER: FieldName[] = ['email', 'organisation', 'role', 'terms']

interface ClaimForm {
  email: string
  organisation: string
  role: string
  today: string
  next: string[]
  wish: string
  terms: boolean
  cmHp: string
}

const ORGANISATION_MAX = 200
const WISH_MAX = 500
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GENERIC_ERROR = 'Something went wrong. Please try again.'

const REQUIRED_MESSAGES: Record<FieldName, string> = {
  email: 'Enter your METASPACE account email.',
  organisation: 'Enter your institution or company.',
  role: 'Select an option.',
  terms: 'You need to agree to the Terms and Privacy policy.',
}

const GOOD_FEATURES = [
  ['Differential analysis by region', 'Draw regions and rank the metabolites that differ between them.'],
  ['Spatial segmentation', 'Find the compartments your tissue actually has.'],
  ['Cross-dataset statistics', 'Compare conditions, timepoints and batches in a single test.'],
]

/**
 * Cyber Monday section of the Pro page: offer column, claim form, validation, submission and the "claim sent"
 * state. Rendered by ProPage in the ProFeatures `afterAnalysis` slot only while the campaign is live.
 */
export default defineComponent({
  name: 'ProCyberMondayClaim',
  props: {
    cyberMonday: { type: Object as PropType<CyberMondayCampaign>, required: true },
    blackFriday: { type: Object as PropType<BlackFridayCampaign | null>, default: null },
  },
  setup(props) {
    const form = reactive<ClaimForm>({
      email: '',
      organisation: '',
      role: '',
      today: '',
      next: [],
      wish: '',
      terms: false,
      cmHp: '',
    })
    const errors = reactive<Partial<Record<FieldName, string>>>({})
    const formError = ref('')
    const pending = ref(false)
    const sent = ref(false)
    const sentHeading = ref<HTMLElement | null>(null)
    const formEl = ref<HTMLElement | null>(null)
    const sentCard = ref<HTMLElement | null>(null)

    // The confirmation is shorter than the form: start it at the form's height and let it ease to its own
    // (the transition, and its reduced-motion opt-out, are in ProPage.scss).
    const showSent = async () => {
      const fromHeight = formEl.value?.offsetHeight || 0
      sent.value = true
      await nextTick()
      const card = sentCard.value
      if (card && fromHeight && card.offsetHeight !== fromHeight) {
        const toHeight = card.offsetHeight
        card.style.height = `${fromHeight}px`
        card.getBoundingClientRect() // commit the start height before changing it
        card.style.height = `${toHeight}px`
        card.addEventListener('transitionend', () => (card.style.height = ''), { once: true })
      }
      sentHeading.value?.focus({ preventScroll: true })
      // The visitor was at the bottom of a tall form: bring the top of the section, and the confirmation, into view.
      document
        .getElementById('claim')
        ?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    }

    const { mutate } = useMutation(sendContactMessageMutation)
    const { result: userResult } = useQuery<any>(currentUserEmailRoleQuery, null, { fetchPolicy: 'cache-first' })

    // The user may arrive after mount; only an empty email is filled so a typed value is never overwritten.
    const userName = computed(() => userResult.value?.currentUser?.name || '')
    watch(
      () => userResult.value?.currentUser,
      (user) => {
        if (!user) {
          return
        }
        form.email = form.email || user.email || ''
      },
      { immediate: true }
    )

    const clearError = (field: FieldName) => {
      delete errors[field]
    }

    const validate = (): void => {
      REQUIRED_ORDER.forEach(clearError)
      if (!form.email.trim()) {
        errors.email = REQUIRED_MESSAGES.email
      } else if (!EMAIL_PATTERN.test(form.email.trim())) {
        errors.email = 'Enter a valid email address.'
      }
      if (!form.organisation.trim()) {
        errors.organisation = REQUIRED_MESSAGES.organisation
      }
      if (!form.role) {
        errors.role = REQUIRED_MESSAGES.role
      }
      if (!form.terms) {
        errors.terms = REQUIRED_MESSAGES.terms
      }
    }

    const onSubmit = async (e: Event) => {
      e.preventDefault()
      if (pending.value) {
        return
      }
      formError.value = ''
      validate()
      if (Object.keys(errors).length) {
        // Move focus to the first invalid control so keyboard and screen reader users land on the problem.
        const first = REQUIRED_ORDER.find((field) => errors[field])
        await nextTick()
        if (first) {
          document.getElementById(`pro-claim-${first}`)?.focus()
        }
        return
      }
      // The honeypot is only ever filled by bots: pretend it worked and send nothing.
      if (form.cmHp) {
        await showSent()
        return
      }
      if (Date.now() > Date.parse(props.cyberMonday.end)) {
        formError.value = `Claims closed on ${formatCampaignDate(props.cyberMonday.end, true)}.`
        return
      }
      pending.value = true
      try {
        await mutate({
          email: form.email.trim(),
          // The contact mutation needs a name and the form has no name field: use the account name, else the email.
          name: escapeHtml(userName.value.trim() || form.email.trim()),
          category: 'pro_claim',
          message: buildClaimMessage(form),
        })
        await showSent()
      } catch {
        formError.value = GENERIC_ERROR
      } finally {
        pending.value = false
      }
    }

    const toggleNext = (key: string, checked: boolean) => {
      form.next = checked ? [...form.next, key] : form.next.filter((k) => k !== key)
    }

    const errorProps = (field: FieldName, extra = '') => ({
      'aria-required': REQUIRED_ORDER.includes(field) ? 'true' : undefined,
      'aria-invalid': errors[field] ? 'true' : undefined,
      'aria-describedby':
        [extra, errors[field] ? `pro-claim-${field}-error` : ''].filter(Boolean).join(' ') || undefined,
    })

    // Always rendered, so showing a message never changes the height of the form.
    const renderError = (field: FieldName) => (
      <p
        class={['pro-claim__error', errors[field] ? '' : 'pro-claim__error--empty']}
        id={`pro-claim-${field}-error`}
        aria-hidden={errors[field] ? undefined : 'true'}
      >
        {errors[field] || '\u00a0'}
      </p>
    )

    const renderText = (field: TextField, label: string, type: string, help: VNode | null = null) => (
      <div class="pro-claim__field pro-claim__field--checked">
        <label for={`pro-claim-${field}`}>{label} *</label>
        <input
          id={`pro-claim-${field}`}
          type={type}
          maxlength={field === 'email' ? undefined : ORGANISATION_MAX}
          autocomplete={field === 'email' ? 'email' : 'organization'}
          value={form[field]}
          onInput={(e: Event) => (form[field] = (e.target as HTMLInputElement).value)}
          {...errorProps(field, help ? `pro-claim-${field}-help` : '')}
        />
        {help}
        {renderError(field)}
      </div>
    )

    const renderSelect = (field: SelectField, label: string, options: ClaimOption[]) => (
      <div class={['pro-claim__field', field === 'role' ? 'pro-claim__field--checked' : '']}>
        <label for={`pro-claim-${field}`}>
          {label}
          {field === 'role' ? ' *' : ''}
        </label>
        <select
          id={`pro-claim-${field}`}
          value={form[field]}
          onChange={(e: Event) => (form[field] = (e.target as HTMLSelectElement).value)}
          {...(field === 'role' ? errorProps('role') : {})}
        >
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        {field === 'role' ? renderError('role') : null}
      </div>
    )

    const renderOffer = () => {
      const { cyberMonday, blackFriday } = props
      const claimBy = formatCampaignDate(cyberMonday.end, true)
      return (
        <div class="pro-claim__offer">
          <p class="pro-eyebrow pro-eyebrow--accent pro-claim__eyebrow">
            {`CYBER MONDAY · ${formatCampaignDate(cyberMonday.start, false)} – ${claimBy}`.toUpperCase()}
          </p>
          <h2 class="pro-h2 pro-claim__title">One month of downstream analysis, on us</h2>
          <p class="pro-claim__lede">
            {`Claim a free ${cyberMonday.passDays}-day pass and run every analysis tool on any of your datasets. ` +
              'The pass covers analysis only — it adds no private submissions to your account.'}
          </p>
          <ul class="pro-claim__features">
            {GOOD_FEATURES.map(([title, body]) => (
              <li key={title}>
                <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
                  <path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2" />
                </svg>
                <div>
                  <b>{title}</b>
                  <span>{body}</span>
                </div>
              </li>
            ))}
          </ul>
          <div class="pro-claim__facts">
            <div class="pro-claim__fact">
              <span>CLAIM BY</span>
              <b>{claimBy}</b>
            </div>
            <div class="pro-claim__fact">
              <span>RUNS FOR</span>
              <b>{`${cyberMonday.passDays} days from activation`}</b>
            </div>
            <div class="pro-claim__fact pro-claim__fact--wide">
              <span>PAYMENT</span>
              <b>No card required</b>
            </div>
          </div>
          <p class="pro-claim__closing">
            Nothing renews and nothing is locked in: your results stay exportable after the month ends.
            {blackFriday
              ? ` If you want to keep going, your plan's ${campaignLabels(blackFriday).code} takes up to ${
                  blackFriday.headlinePercent
                }% off until ${formatCampaignDate(blackFriday.end, false)}.`
              : ''}
          </p>
        </div>
      )
    }

    const renderSent = () => {
      const days = props.cyberMonday.activationTurnaroundDays
      const bf = props.blackFriday
      const steps = [
        {
          title: 'We switch on downstream analysis',
          text: 'Someone on our team reviews your claim and activates the pass on your account.',
        },
        {
          title: 'You get an email',
          text:
            'We write to your METASPACE account address as soon as it is on' +
            (days === null || days === undefined ? '.' : `, usually within ${days} working days.`),
        },
        {
          title: `Your ${props.cyberMonday.passDays} days start`,
          text: 'The clock starts on the day of activation, not today.',
        },
      ]
      return (
        <div class="pro-claim__card pro-claim__card--sent" ref={sentCard}>
          <div class="pro-claim__sent-head">
            <span class="pro-claim__tick" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="22" height="22" focusable="false">
                <path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2" />
              </svg>
            </span>
            <h3 class="pro-claim__card-title" tabindex="-1" ref={sentHeading}>
              Your claim was sent
            </h3>
          </div>
          <p>
            Thank you — we have your claim. Each pass is activated by hand, so there is nothing more for you to do right
            now.
          </p>
          <div class="pro-claim__divider" />
          <p class="pro-claim__section-label">WHAT HAPPENS NEXT</p>
          <ol class="pro-claim__steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span class="pro-claim__step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div class="pro-claim__actions">
            <a class="pro-btn pro-btn--accent" href="/docs" target="_blank" rel="noopener noreferrer">
              Read the analysis guides
            </a>
            <a
              class="pro-btn pro-btn--ghost"
              href="#plans"
              onClick={(e: MouseEvent) => scrollToHashSection(e, '#plans')}
            >
              Check our offers
            </a>
          </div>
          {bf ? (
            <div class="pro-claim__ends">
              <span>WHEN YOUR MONTH ENDS</span>
              <p>
                {`Keep going with up to ${bf.headlinePercent}% off your first year. ` +
                  `Your plan's ${campaignLabels(bf).code} is in the plans section, ` +
                  `valid until ${formatCampaignDate(bf.end, true)}.`}
              </p>
            </div>
          ) : null}
        </div>
      )
    }

    const renderForm = () => (
      <form class="pro-claim__card" noValidate onSubmit={onSubmit} ref={formEl}>
        <h3 class="pro-claim__card-title">Claim your free month</h3>
        <p class="pro-claim__intro">We activate each pass by hand and email you when it is on. One pass per account.</p>
        {renderText(
          'email',
          'METASPACE account email',
          'email',
          <p class="pro-claim__help" id="pro-claim-email-help">
            The email you sign in with — we switch the pass on for that account. No account yet?{' '}
            <a href="/account/create-account" target="_blank" rel="noopener noreferrer">
              Create one free
            </a>{' '}
            first.
          </p>
        )}
        <div class="pro-claim__row">
          {renderText('organisation', 'Institution or company', 'text')}
          {renderSelect('role', 'Your role', CLAIM_OPTIONS.role)}
        </div>

        <div class="pro-claim__divider" />
        <p class="pro-claim__section-label">TWO QUICK QUESTIONS · OPTIONAL</p>
        <p class="pro-claim__help">Your pass includes every analysis tool whatever you answer.</p>
        {renderSelect('today', 'How do you analyse your annotations today?', CLAIM_OPTIONS.today)}

        <fieldset class="pro-claim__fieldset">
          <legend>Which analysis would you like next?</legend>
          <div class="pro-claim__checks">
            {CLAIM_OPTIONS.next.map((o) => (
              <label key={o.key} class="pro-claim__check" for={`pro-claim-next-${o.key}`}>
                <input
                  id={`pro-claim-next-${o.key}`}
                  type="checkbox"
                  name="next"
                  value={o.key}
                  checked={form.next.includes(o.key)}
                  onChange={(e: Event) => toggleNext(o.key, (e.target as HTMLInputElement).checked)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div class="pro-claim__field">
          <label for="pro-claim-wish">
            Anything else you wish you could do with your results? <span class="pro-claim__optional">(optional)</span>
          </label>
          <input
            id="pro-claim-wish"
            type="text"
            maxlength={WISH_MAX}
            value={form.wish}
            onInput={(e: Event) => (form.wish = (e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="pro-claim__divider" />
        <label class="pro-claim__check" for="pro-claim-terms">
          <input
            id="pro-claim-terms"
            type="checkbox"
            checked={form.terms}
            onChange={(e: Event) => (form.terms = (e.target as HTMLInputElement).checked)}
            {...errorProps('terms')}
          />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">
              Terms
            </a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">
              Privacy policy
            </a>
            . *
          </span>
        </label>
        {renderError('terms')}

        {/* Honeypot: real visitors never see or reach it; a submit with it filled is silently not sent. */}
        <div class="pro-claim__trap" aria-hidden="true">
          <input
            type="text"
            id="cm_hp"
            name="cm_hp"
            tabindex={-1}
            autocomplete="off"
            aria-hidden="true"
            value={form.cmHp}
            onInput={(e: Event) => (form.cmHp = (e.target as HTMLInputElement).value)}
          />
        </div>

        {formError.value ? (
          <p class="pro-claim__form-error" role="alert">
            {formError.value}
          </p>
        ) : null}
        <button type="submit" class="pro-btn pro-btn--accent pro-btn--block" disabled={pending.value}>
          Claim my free month
        </button>
        <p class="pro-claim__fine">
          {`No card required · Claims close ${formatCampaignDate(props.cyberMonday.end, true)} · Nothing renews`}
        </p>
      </form>
    )

    return () => (
      <section id="claim" class="pro-section pro-section--ink pro-claim" data-cta-section="claim">
        <div class="pro-shell pro-claim__grid">
          {renderOffer()}
          {sent.value ? renderSent() : renderForm()}
        </div>
      </section>
    )
  },
})
