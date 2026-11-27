import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ProCampaignBanner from './ProCampaignBanner'
import type { BlackFridayCampaign, CyberMondayCampaign } from '../campaign'

const blackFriday: BlackFridayCampaign = {
  start: '2026-11-27T00:00:00Z',
  end: '2026-12-31T23:59:59Z',
  headlinePercent: 50,
  codes: [],
}

const cyberMonday: CyberMondayCampaign = {
  start: '2026-11-30T00:00:00Z',
  end: '2026-12-13T23:59:59Z',
  passDays: 30,
  activationTurnaroundDays: null,
}

const mountBanner = (props: { blackFriday: BlackFridayCampaign | null; cyberMonday: CyberMondayCampaign | null }) =>
  mount(ProCampaignBanner, { props })

describe('ProCampaignBanner', () => {
  it('renders nothing when no campaign is live', () => {
    const wrapper = mountBanner({ blackFriday: null, cyberMonday: null })
    expect(wrapper.find('.pro-campaign-banner').exists()).toBe(false)
    expect(wrapper.html()).toBe('')
  })

  it('renders one Black Friday row when only Black Friday is live', () => {
    const wrapper = mountBanner({ blackFriday, cyberMonday: null })
    const rows = wrapper.findAll('.pro-campaign-banner')
    expect(rows).toHaveLength(1)
    expect(rows[0].find('.pro-campaign-banner__label').text()).toBe('BLACK FRIDAY · UNTIL 31\u00a0DEC\u00a02026')
    expect(rows[0].find('.pro-campaign-banner__text').text()).toBe(
      'Up to 50% off METASPACE Pro plans. Each plan has its own code.'
    )
    const link = rows[0].find('a')
    expect(link.text()).toBe('See the codes')
    expect(link.attributes('href')).toBe('#plans')
    expect(rows[0].classes()).not.toContain('pro-campaign-banner--slate')
  })

  it('stacks Cyber Monday above Black Friday when both are live', () => {
    const wrapper = mountBanner({ blackFriday, cyberMonday })
    const rows = wrapper.findAll('.pro-campaign-banner')
    expect(rows).toHaveLength(2)

    expect(rows[0].find('.pro-campaign-banner__label').text()).toBe('CYBER MONDAY')
    expect(rows[0].find('.pro-campaign-banner__text').text()).toBe(
      'A free month of downstream analysis — claim by 13\u00a0Dec\u00a02026'
    )
    expect(rows[0].find('a').text()).toBe('Claim it')
    expect(rows[0].find('a').attributes('href')).toBe('#claim')
    expect(rows[0].classes()).not.toContain('pro-campaign-banner--slate')

    expect(rows[1].find('.pro-campaign-banner__label').text()).toBe('BLACK FRIDAY')
    expect(rows[1].find('.pro-campaign-banner__text').text()).toBe(
      "Up to 50% off plans with your plan's code — until 31\u00a0Dec\u00a02026"
    )
    expect(rows[1].find('a').text()).toBe('See codes')
    expect(rows[1].find('a').attributes('href')).toBe('#plans')
    expect(rows[1].classes()).toContain('pro-campaign-banner--slate')
  })

  it('takes the percentage from headlinePercent', () => {
    const wrapper = mountBanner({ blackFriday: { ...blackFriday, headlinePercent: 30 }, cyberMonday: null })
    expect(wrapper.find('.pro-campaign-banner__text').text()).toContain('Up to 30% off')
    expect(wrapper.find('.pro-campaign-banner__text').text()).not.toContain('50%')
  })

  it('formats the end dates from the campaign data', () => {
    const wrapper = mountBanner({
      blackFriday: { ...blackFriday, end: '2026-12-20T23:59:59Z' },
      cyberMonday: { ...cyberMonday, end: '2026-12-10T23:59:59Z' },
    })
    expect(wrapper.text()).toContain('claim by 10\u00a0Dec\u00a02026')
    expect(wrapper.text()).toContain('until 20\u00a0Dec\u00a02026')
  })

  it('scrolls to the section instead of jumping when the link target exists', () => {
    const target = document.createElement('div')
    target.id = 'plans'
    const scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView
    document.body.appendChild(target)
    try {
      const wrapper = mountBanner({ blackFriday, cyberMonday: null })
      wrapper.find('a').trigger('click')
      expect(scrollIntoView).toHaveBeenCalled()
    } finally {
      document.body.removeChild(target)
    }
  })
})
