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
    expect(wrapper.text()).not.toContain('valid 60 days')
    expect(wrapper.text()).not.toContain('metacloud.bio')
    expect(wrapper.findAll('.pro-checklist li').map((li) => li.text())).toEqual([
      'Purchase orders and institutional invoicing accepted on every paid plan',
      'Multi-year plans lock the price for the length of a funding period; 1-2 year terms by quote',
    ])
  })

  it('shows the unverified procurement specifics alongside the base facts when its flag is on', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    expect(wrapper.text()).toContain('valid 60 days')
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

  it('heads the institutions section and says no subscription needs a personal card', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    const text = wrapper.get('#procurement').text()
    expect(text).toContain('For institutions')
    expect(text).toContain('Set up for how institutions already pay')
    expect(text).toContain(
      'No subscription needs to go on a personal card. Every paid plan works with how institutions actually pay — ' +
        'purchase orders, invoices, and budgets that plan more than a year out.'
    )
  })

  it('lists the five procurement facts in the order the design calls for', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    const items = wrapper.findAll('.pro-checklist li').map((li) => li.text())
    expect(items).toEqual([
      'Formal quote as a PDF, valid 60 days — usable inside a grant application',
      'Purchase orders and institutional invoicing accepted on every paid plan',
      'Multi-year plans lock the price for the length of a funding period; 1-2 year terms by quote',
      'Invoices issued by Metacloud Inc. with full institutional details — metacloud.bio',
    ])
  })

  it('offers a quote request and an email CTA', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    const buttons = wrapper.findAll('#procurement a.pro-btn')
    expect(buttons.map((b) => b.text())).toEqual(['Request a quote', 'Contact the team'])
    expect(buttons[0].classes()).toContain('pro-btn--accent')
    expect(buttons[1].classes()).toContain('pro-btn--ghost')
  })

  it('renders a pasteable budget request with the two-year total', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    expect(wrapper.get('.pro-quote-box__head').text()).toBe('Ready to paste into a budget request')
    const body = wrapper.get('.pro-quote-box__body').text()
    expect(body).toContain(
      'METASPACE Pro subscription (Advanced tier) — cloud-based spatial metabolomics annotation and statistical ' +
        'analysis platform.'
    )
    expect(body).toContain('$2,999 per year × 2 years = $5,698')
    expect(body).toContain('Metacloud Inc. · quote ref. on request')
  })

  it('exposes the procurement anchor used by the "Request a quote" link and the dataset pack CTA', async () => {
    const wrapper = await mountWithFlags({ procurementDetail: true })
    expect(wrapper.find('#procurement').exists()).toBe(true)
  })
})
