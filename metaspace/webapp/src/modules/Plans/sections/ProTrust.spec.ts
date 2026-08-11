import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

afterEach(() => {
  vi.resetModules()
})

const mountWithFlags = async (flags: Record<string, boolean>) => {
  vi.doMock('../proContent', async () => {
    const actual: any = await vi.importActual('../proContent')
    return { ...actual, PRO_FLAGS: { ...actual.PRO_FLAGS, ...flags } }
  })
  const ProTrust = (await import('./ProTrust')).default
  return mount(ProTrust)
}

describe('ProTrust', () => {
  // The page runs Docs -> Plans -> Procurement. The citability argument is
  // made once, in the FAQ; the standalone methods callout was removed.
  it('no longer renders a methods section', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    expect(wrapper.find('#methods').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Every method is documented and citable')
    expect(wrapper.text()).not.toContain('Methods documentation')
  })

  it('no longer renders a case study block - it was removed along with its flag', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    expect(wrapper.find('[data-test="case-study"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Case study headline')
  })

  it('hides the unverified procurement specifics when its flag is off', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: false })
    expect(wrapper.text()).not.toContain('valid 90 days')
    expect(wrapper.text()).not.toContain('metacloud.bio')
    expect(wrapper.findAll('.pro-checklist li').map((li) => li.text())).toEqual([
      'Purchase orders and institutional invoicing accepted on every paid plan',
      'VAT ID captured at checkout; prices shown exclude tax',
      'Multi-year plans lock the price for the length of a funding period; 3–5 year terms by quote',
    ])
  })

  it('shows the unverified procurement specifics alongside the base facts when its flag is on', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    expect(wrapper.text()).toContain('valid 90 days')
    expect(wrapper.text()).toContain('Metacloud Inc.')
    expect(wrapper.text()).toContain('Purchase orders and institutional invoicing')
  })

  it('links the Metacloud invoicing credit to metacloud.bio', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    const link = wrapper.findAll('a').find((a) => a.text() === 'metacloud.bio')
    expect(link).toBeTruthy()
    expect(link!.attributes('href')).toBe('https://metacloud.bio')
    expect(link!.attributes('target')).toBe('_blank')
    expect(link!.attributes('rel')).toBe('noopener noreferrer')
  })

  it('heads the procurement section and names the price nobody puts on a personal card', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    const text = wrapper.get('#procurement').text()
    expect(text).toContain('Procurement')
    expect(text).toContain('Built for how institutions actually buy')
    expect(text).toContain(
      'Nobody expects a group leader to put $2,999 on a personal card. Everything below is standard, and none of ' +
        'it needs a sales call.'
    )
  })

  it('lists the five procurement facts in the order the design calls for', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    const items = wrapper.findAll('.pro-checklist li').map((li) => li.text())
    expect(items).toEqual([
      'Formal quote as a PDF, valid 90 days — usable inside a grant application',
      'Purchase orders and institutional invoicing accepted on every paid plan',
      'VAT ID captured at checkout; prices shown exclude tax',
      'Multi-year plans lock the price for the length of a funding period; 3–5 year terms by quote',
      'Invoices issued by Metacloud Inc. with full institutional details — metacloud.bio',
    ])
  })

  it('offers a quote request and an email CTA', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    const buttons = wrapper.findAll('#procurement a.pro-btn')
    expect(buttons.map((b) => b.text())).toEqual(['Request a quote', 'Email the team'])
    expect(buttons[0].classes()).toContain('pro-btn--accent')
    expect(buttons[1].classes()).toContain('pro-btn--ghost')
  })

  it('renders a pasteable grant budget justification with the three-year total', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    expect(wrapper.get('.pro-quote-box__head').text()).toBe('Paste into a grant budget justification')
    const body = wrapper.get('.pro-quote-box__body').text()
    expect(body).toContain(
      'METASPACE Pro subscription (Advanced tier) — cloud-based spatial metabolomics annotation and statistical ' +
        'analysis platform.'
    )
    expect(body).toContain('$2,999 per year × 3 years = $8,997')
    expect(body).toContain('Metacloud Inc. · quote ref. on request')
  })

  it('exposes the procurement anchor used by the "Request a quote" link and the dataset pack CTA', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    expect(wrapper.find('#procurement').exists()).toBe(true)
  })
})
