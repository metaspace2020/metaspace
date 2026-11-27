import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useMutation, useQuery } from '@vue/apollo-composable'
import { sendContactMessageMutation } from '../../../api/user'
import ProCyberMondayClaim from './ProCyberMondayClaim'
import { buildClaimMessage, CLAIM_OPTIONS } from '../campaign'
import type { BlackFridayCampaign, CyberMondayCampaign } from '../campaign'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}))

const cyberMonday: CyberMondayCampaign = {
  start: '2026-11-30T00:00:00.000Z',
  end: '2026-12-13T23:59:59.000Z',
  passDays: 30,
  activationTurnaroundDays: null,
}
const blackFriday: BlackFridayCampaign = {
  start: '2026-11-27T00:00:00.000Z',
  end: '2026-12-31T23:59:59.000Z',
  headlinePercent: 50,
  codes: [],
}

let currentUser: { id: string; name: string; email: string } | null
let mutate: ReturnType<typeof vi.fn>

const mountClaim = (props: Record<string, unknown> = {}) =>
  mount(ProCyberMondayClaim, {
    props: { cyberMonday, blackFriday: null, ...props },
    attachTo: document.body,
  })

const fillValid = async (wrapper: ReturnType<typeof mountClaim>) => {
  await wrapper.get('#pro-claim-email').setValue(' ADA@example.org ')
  await wrapper.get('#pro-claim-organisation').setValue(' EMBL ')
  await wrapper.get('#pro-claim-role').setValue('postdoc')
  await wrapper.get('#pro-claim-terms').setValue(true)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Inside the claim window, so the tests do not depend on the day they run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-12-01T12:00:00Z'))
  document.body.innerHTML = ''
  currentUser = null
  mutate = vi.fn().mockResolvedValue({ data: { sendContactMessage: true } })
  ;(useMutation as any).mockImplementation(() => ({ mutate }))
  ;(useQuery as any).mockImplementation(() => ({ result: ref({ currentUser }), loading: ref(false) }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ProCyberMondayClaim', () => {
  it('renders the section, heading and the three fact boxes from props', () => {
    const wrapper = mountClaim()
    const section = wrapper.get('section#claim')
    expect(section.text()).toContain('CYBER MONDAY · 30 NOV – 13 DEC 2026')
    expect(section.get('h2').text()).toBe('One month of downstream analysis, on us')
    expect(section.text()).toContain('CLAIM BY')
    expect(section.text()).toContain('13 Dec 2026')
    expect(section.text()).toContain('RUNS FOR')
    expect(section.text()).toContain('30 days from activation')
    expect(section.text()).toContain('PAYMENT')
    expect(section.text()).toContain('No card required')
    expect(section.text()).toContain('Claims close 13 Dec 2026')
  })

  it('derives the pass length from passDays', () => {
    const wrapper = mountClaim({ cyberMonday: { ...cyberMonday, passDays: 14 } })
    expect(wrapper.text()).toContain('14 days from activation')
    expect(wrapper.text()).toContain('Claim a free 14-day pass')
  })

  it('renders the card in the owner order with the removed questions gone', () => {
    const wrapper = mountClaim()
    const text = wrapper.get('form').text()
    const ordered = [
      'Claim your free month',
      'We activate each pass by hand and email you when it is on. One pass per account.',
      'METASPACE account email *',
      'The email you sign in with — we switch the pass on for that account. No account yet? Create one free first.',
      'Institution or company *',
      'Your role *',
      'TWO QUICK QUESTIONS · OPTIONAL',
      'Your pass includes every analysis tool whatever you answer.',
      'How do you analyse your annotations today?',
      'Which analysis would you like next?',
      'Anything else you wish you could do with your results? (optional)',
      'I agree to the',
      'Claim my free month',
      'No card required · Claims close 13 Dec 2026 · Nothing renews',
    ]
    let last = -1
    ordered.forEach((label) => {
      const at = text.indexOf(label)
      expect(at, label).toBeGreaterThan(last)
      last = at
    })
    ;[
      'Full name',
      'hardest part',
      'How many datasets',
      'Email me tips',
      'Fields marked * are required',
      'Takes about a minute',
      'ABOUT YOUR ANALYSIS',
    ].forEach((gone) => expect(text).not.toContain(gone))
    ;['name', 'hardest', 'studySize', 'updates'].forEach((id) =>
      expect(wrapper.find(`#pro-claim-${id}`).exists()).toBe(false)
    )
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.get('#pro-claim-email').element.closest('.pro-claim__row')).toBeNull()
    expect(wrapper.get('#pro-claim-organisation').element.closest('.pro-claim__row')).not.toBeNull()
    expect(wrapper.get('#pro-claim-role').element.closest('.pro-claim__row')).not.toBeNull()
  })

  it('offers the role and today options in order, and exactly the four next analyses', () => {
    const wrapper = mountClaim()
    ;(['role', 'today'] as const).forEach((name) => {
      const options = wrapper.findAll(`#pro-claim-${name} option`)
      expect(options[0].text()).toBe('Select…')
      expect(options.slice(1).map((o) => o.text())).toEqual(CLAIM_OPTIONS[name].map((o) => o.label))
      expect(options.slice(1).map((o) => o.attributes('value'))).toEqual(CLAIM_OPTIONS[name].map((o) => o.key))
    })
    const boxes = wrapper.findAll('fieldset input[type="checkbox"]')
    expect(boxes.map((b) => b.attributes('value'))).toEqual(['pathway', 'histology', 'multi_omics', 'cell_type'])
    expect(wrapper.findAll('fieldset label').map((l) => l.text())).toEqual([
      'Pathway analysis',
      'Histology overlay',
      'Multi-omics integration',
      'Cell-type analysis',
    ])
    expect(wrapper.get('#pro-claim-terms').element).toHaveProperty('checked', false)
  })

  it('gives every control a label whose for matches its id, and groups "next" in a fieldset', () => {
    const wrapper = mountClaim()
    const controls = wrapper.findAll('input:not([name="cm_hp"]), select')
    expect(controls).toHaveLength(10)
    controls.forEach((control) => {
      const id = control.attributes('id')
      expect(id).toBeTruthy()
      expect(wrapper.find(`label[for="${id}"]`).exists()).toBe(true)
    })
    const fieldset = wrapper.get('fieldset')
    expect(fieldset.get('legend').text()).toBe('Which analysis would you like next?')
  })

  it('links sign-up, Terms and Privacy and the honeypot is hidden from users', () => {
    const wrapper = mountClaim()
    expect(wrapper.get('a[href="/account/create-account"]').text()).toBe('Create one free')
    expect(wrapper.get('a[href="/terms"]').text()).toBe('Terms')
    expect(wrapper.get('a[href="/privacy"]').text()).toBe('Privacy policy')
    const honeypot = wrapper.get('input[name="cm_hp"]')
    expect(honeypot.attributes('tabindex')).toBe('-1')
    expect(honeypot.attributes('autocomplete')).toBe('off')
    expect(honeypot.attributes('aria-hidden')).toBe('true')
  })

  it('caps the free-text lengths', () => {
    const wrapper = mountClaim()
    expect(wrapper.get('#pro-claim-organisation').attributes('maxlength')).toBe('200')
    expect(wrapper.get('#pro-claim-wish').attributes('maxlength')).toBe('500')
    expect(wrapper.get('#pro-claim-wish').element.tagName).toBe('INPUT')
  })

  it('prefills the email for a signed-in user and stays empty for an anonymous one', async () => {
    currentUser = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.org' }
    const signedIn = mountClaim()
    await nextTick()
    expect((signedIn.get('#pro-claim-email').element as HTMLInputElement).value).toBe('ada@example.org')

    currentUser = null
    const anonymous = mountClaim()
    await nextTick()
    expect((anonymous.get('#pro-claim-email').element as HTMLInputElement).value).toBe('')
  })

  it('does not overwrite a typed email when the user query resolves late', async () => {
    const late = ref<{ currentUser: unknown }>({ currentUser: null })
    ;(useQuery as any).mockImplementation(() => ({ result: late, loading: ref(false) }))
    const wrapper = mountClaim()
    await wrapper.get('#pro-claim-email').setValue('typed@example.org')
    late.value = { currentUser: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.org' } }
    await nextTick()
    expect((wrapper.get('#pro-claim-email').element as HTMLInputElement).value).toBe('typed@example.org')
  })

  it('marks the required controls and moves focus to the first invalid one', async () => {
    const wrapper = mountClaim()
    ;['email', 'organisation', 'role', 'terms'].forEach((field) =>
      expect(wrapper.get(`#pro-claim-${field}`).attributes('aria-required')).toBe('true')
    )
    ;['today', 'wish', 'next-pathway'].forEach((field) =>
      expect(wrapper.get(`#pro-claim-${field}`).attributes('aria-required')).toBeUndefined()
    )
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#pro-claim-email').element)
    expect(mutate).not.toHaveBeenCalled()
    await wrapper.get('#pro-claim-email').setValue('ada@example.org')
    await wrapper.get('#pro-claim-organisation').setValue('EMBL')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#pro-claim-role').element)
  })

  it('escapes markup in the organisation and the free text it sends', async () => {
    const wrapper = mountClaim()
    await fillValid(wrapper)
    await wrapper.get('#pro-claim-organisation').setValue('a<b & <em>x</em>')
    await wrapper.get('#pro-claim-wish').setValue('x<i>y</i>')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const sent = mutate.mock.calls[0][0]
    expect(sent.message).toContain('Institution or company: a&lt;b &amp; &lt;em&gt;x&lt;/em&gt;<br>')
    expect(sent.message).toContain('Something else: x&lt;i&gt;y&lt;/i&gt;')
    expect(sent.message).not.toContain('<em>')
    expect(sent.message).not.toContain('<i>')
  })

  it('does not submit an empty form and shows described errors while keeping typed values', async () => {
    const wrapper = mountClaim()
    await wrapper.get('#pro-claim-organisation').setValue('EMBL')
    await wrapper.get('form').trigger('submit')
    await nextTick()
    expect(mutate).not.toHaveBeenCalled()

    const expected: Record<string, string> = {
      email: 'Enter your METASPACE account email.',
      organisation: '',
      role: 'Select an option.',
      terms: 'You need to agree to the Terms and Privacy policy.',
    }
    Object.entries(expected).forEach(([field, message]) => {
      const control = wrapper.get(`#pro-claim-${field}`)
      if (!message) {
        expect(control.attributes('aria-describedby') || '').not.toContain('error')
        return
      }
      const errorId = `pro-claim-${field}-error`
      expect(control.attributes('aria-describedby')).toContain(errorId)
      expect(wrapper.get(`#${errorId}`).text()).toBe(message)
    })
    expect(wrapper.find('#pro-claim-today-error').exists()).toBe(false)
    expect((wrapper.get('#pro-claim-organisation').element as HTMLInputElement).value).toBe('EMBL')
  })

  it('rejects a malformed email', async () => {
    const wrapper = mountClaim()
    await wrapper.get('#pro-claim-email').setValue('not-an-email')
    await wrapper.get('form').trigger('submit')
    await nextTick()
    expect(wrapper.get('#pro-claim-email-error').text()).toBe('Enter a valid email address.')
  })

  it('submits with only the four required answers', async () => {
    const wrapper = mountClaim()
    await fillValid(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0].message).toContain('Analyses annotations today: -<br>')
    expect(mutate.mock.calls[0][0].message).toContain('Wants next: -<br>')
    expect(mutate.mock.calls[0][0].message).toContain('Something else: -<br>')
  })

  it('sends the account name when signed in and the form email otherwise', async () => {
    currentUser = { id: 'u1', name: 'Ada <b>Lovelace</b>', email: 'ada@example.org' }
    const signedIn = mountClaim()
    await nextTick()
    await fillValid(signedIn)
    await signedIn.get('form').trigger('submit')
    await flushPromises()
    expect(mutate.mock.calls[0][0].name).toBe('Ada &lt;b&gt;Lovelace&lt;/b&gt;')

    mutate.mockClear()
    currentUser = null
    const anonymous = mountClaim()
    await fillValid(anonymous)
    await anonymous.get('form').trigger('submit')
    await flushPromises()
    expect(mutate.mock.calls[0][0].name).toBe('ADA@example.org')
    expect(mutate.mock.calls[0][0].email).toBe('ADA@example.org')
  })

  it('sends one contact message with the trimmed values, and ignores a second submit while pending', async () => {
    let resolve: (value: unknown) => void = () => {}
    mutate.mockReturnValue(new Promise((r) => (resolve = r)))
    const wrapper = mountClaim()
    await fillValid(wrapper)
    await wrapper.get('#pro-claim-today').setValue('own_scripts')
    await wrapper.get('#pro-claim-wish').setValue('  more figures ')
    await wrapper.get('input[value="cell_type"]').setValue(true)
    await wrapper.get('input[value="pathway"]').setValue(true)

    await wrapper.get('form').trigger('submit')
    await nextTick()
    await wrapper.get('form').trigger('submit')
    expect(useMutation).toHaveBeenCalledWith(sendContactMessageMutation)
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith({
      email: 'ADA@example.org',
      name: 'ADA@example.org',
      category: 'pro_claim',
      message: buildClaimMessage({
        organisation: 'EMBL',
        role: 'postdoc',
        today: 'own_scripts',
        next: ['pathway', 'cell_type'],
        wish: 'more figures',
      }),
    })
    expect(mutate.mock.calls[0][0].message).toContain('Role: Postdoc / staff scientist')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    resolve({ data: { sendContactMessage: true } })
    await flushPromises()
  })

  it('sends nothing when the honeypot is filled but shows the sent state', async () => {
    const wrapper = mountClaim()
    await fillValid(wrapper)
    await wrapper.get('input[name="cm_hp"]').setValue('https://spam.example')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mutate).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.get('h3[tabindex="-1"]').text()).toBe('Your claim was sent')
  })

  it('swaps the form for the sent card and focuses its heading', async () => {
    const wrapper = mountClaim()
    await fillValid(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    const heading = wrapper.get('h3[tabindex="-1"]')
    expect(heading.text()).toBe('Your claim was sent')
    expect(document.activeElement).toBe(heading.element)
    expect(wrapper.text()).toContain(
      'Thank you — we have your claim. Each pass is activated by hand, ' +
        'so there is nothing more for you to do right now.'
    )
    expect(wrapper.text()).toContain('WHAT HAPPENS NEXT')
    expect(wrapper.findAll('.pro-claim__steps li').map((li) => li.get('strong').text())).toEqual([
      'We switch on downstream analysis',
      'You get an email',
      'Your 30 days start',
    ])
    expect(wrapper.text()).toContain('The clock starts on the day of activation, not today.')
    expect(wrapper.text()).toContain('Read the analysis guides')
    expect(wrapper.get('a[href="#plans"]').text()).toBe('Check our offers')
    expect(wrapper.text()).not.toContain('Back to the form')
    expect(wrapper.get('a[href="/docs"]').text()).toBe('Read the analysis guides')
  })

  it('words the turnaround by activationTurnaroundDays', async () => {
    const without = mountClaim()
    await fillValid(without)
    await without.get('form').trigger('submit')
    await flushPromises()
    expect(without.text()).toContain('We write to your METASPACE account address as soon as it is on.')
    expect(without.text()).not.toContain('working days')

    const withDays = mountClaim({ cyberMonday: { ...cyberMonday, activationTurnaroundDays: 3 } })
    await fillValid(withDays)
    await withDays.get('form').trigger('submit')
    await flushPromises()
    expect(withDays.text()).toContain('as soon as it is on, usually within 3 working days.')
  })

  it('mentions Black Friday only when it is live', async () => {
    const off = mountClaim()
    expect(off.text()).not.toContain('Black Friday')
    await fillValid(off)
    await off.get('form').trigger('submit')
    await flushPromises()
    expect(off.text()).not.toContain('WHEN YOUR MONTH ENDS')
    expect(off.text()).not.toContain('Black Friday')

    const on = mountClaim({ blackFriday })
    expect(on.text()).toContain("your plan's Black Friday code takes up to 50% off until 31 Dec.")
    await fillValid(on)
    await on.get('form').trigger('submit')
    await flushPromises()
    expect(on.text()).toContain('WHEN YOUR MONTH ENDS')
    expect(on.text()).toContain('Keep going with up to 50% off your first year.')
    expect(on.text()).toContain('valid until 31 Dec 2026.')
  })

  describe('failures', () => {
    it('shows a generic message above the button, keeps the values and re-enables the button', async () => {
      mutate.mockRejectedValue(new Error('Network down'))
      const wrapper = mountClaim()
      await fillValid(wrapper)
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toBe('Something went wrong. Please try again.')
      expect((wrapper.get('#pro-claim-email').element as HTMLInputElement).value).toBe('ADA@example.org')
      expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    })

    it('sends nothing after the claim window closes', async () => {
      vi.setSystemTime(new Date('2026-12-14T00:00:00Z'))
      const wrapper = mountClaim()
      await fillValid(wrapper)
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(mutate).not.toHaveBeenCalled()
      expect(wrapper.get('[role="alert"]').text()).toBe('Claims closed on 13 Dec 2026.')
    })
  })
})
