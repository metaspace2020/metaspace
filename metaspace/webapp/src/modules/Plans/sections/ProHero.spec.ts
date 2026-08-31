import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProHero from './ProHero'

describe('ProHero', () => {
  it('renders the live counts with thousands separators', () => {
    const wrapper = mount(ProHero, {
      props: { userCount: 6077, datasetCount: 76204, publicationCount: 651 },
    })
    expect(wrapper.text()).toContain('6,077')
    expect(wrapper.text()).toContain('76,204')
    expect(wrapper.text()).toContain('651')
  })

  it('renders an em dash while counts are still loading', () => {
    const wrapper = mount(ProHero, {
      props: { userCount: null, datasetCount: null, publicationCount: null },
    })
    const values = wrapper
      .findAll('.pro-stats__value')
      .slice(0, 3)
      .map((n) => n.text())
    expect(values).toEqual(['—', '—', '—'])
    // Guard against a lookalike character (hyphen-minus or en dash) sneaking in.
    values.forEach((value) => {
      expect(value).toBe('—')
      expect(value.charCodeAt(0)).toBe(0x2014)
    })
  })

  it('renders zero counts as "0", not an em dash', () => {
    const wrapper = mount(ProHero, {
      props: { userCount: 0, datasetCount: 0, publicationCount: 0 },
    })
    const values = wrapper
      .findAll('.pro-stats__value')
      .slice(0, 3)
      .map((n) => n.text())
    expect(values).toEqual(['0', '0', '0'])
  })

  it('always shows the static Nature Methods tile', () => {
    const wrapper = mount(ProHero, {
      props: { userCount: null, datasetCount: null, publicationCount: null },
    })
    expect(wrapper.text()).toContain('2017')
    expect(wrapper.text()).toContain('Nature Methods')
  })

  it('renders the signature strip', () => {
    const wrapper = mount(ProHero, {
      props: { userCount: 1, datasetCount: 1, publicationCount: 1 },
    })
    expect(wrapper.find('.pro-signature').exists()).toBe(true)
  })

  it('renders the brand band inside the figure card, above the figure body', () => {
    const wrapper = mount(ProHero, {
      props: { userCount: 1, datasetCount: 1, publicationCount: 1 },
    })
    const card = wrapper.get('.pro-hero__figure')
    const band = card.get('.pro-hero__brand')
    expect(band.text()).toBe('Pro')
    // The band is the card's first child and the artwork follows it, so the
    // orange sits at the top of the card rather than beside or below the
    // figure.
    const children = Array.from(card.element.children)
    expect(children[0]).toBe(band.element)
    expect(children[1].classList.contains('pro-hero__figure-body')).toBe(true)
    expect(card.get('.pro-hero__figure-body .pro-signature').exists()).toBe(true)
  })

  it('renders the METASPACE wordmark in the band with a single accessible name', () => {
    const band = mount(ProHero, {
      props: { userCount: 1, datasetCount: 1, publicationCount: 1 },
    }).get('.pro-hero__brand')
    expect(band.attributes('role')).toBe('img')
    expect(band.attributes('aria-label')).toBe('METASPACE Pro')
    // The wordmark is the inline SVG mark, not an <img>, so it takes the band
    // colour treatment from CSS.
    const mark = band.get('.pro-hero__brand-mark')
    expect(mark.element.tagName.toLowerCase()).toBe('svg')
    // The mark is hidden from assistive tech so the wrapper's label is
    // announced once rather than "METASPACE" followed by "METASPACE Pro".
    expect(mark.attributes('aria-hidden')).toBe('true')
    // The lockup is the app-wide composition rather than a bespoke one: the
    // round METASPACE logomark with "Pro" overlaid on it, then the wordmark.
    // The badge sits on the pale logomark, not on the orange band, which is
    // what keeps the accent-coloured "Pro" legible against an accent
    // background.
    expect(band.get('img').attributes('src')).toBeTruthy()
    expect(band.text()).toBe('Pro')
  })

  it('renders the headline copy, eyebrow and lede', () => {
    const text = mount(ProHero, {
      props: { userCount: 1, datasetCount: 1, publicationCount: 1 },
    }).text()
    expect(text).toContain('METASPACE Pro · ALL IN ONE · end-to-end')
    expect(text).toContain('Turning peaks into insights')
    expect(text).toContain(
      'Downstream functional analysis, now built directly onto the annotation engine you already trust and use — ' +
        'on data that never enters the public database until you say so.'
    )
  })

  it('qualifies the free offer as the first 3 private datasets, with no card', () => {
    const note = mount(ProHero, {
      props: { userCount: 1, datasetCount: 1, publicationCount: 1 },
    }).get('.pro-note')
    expect(note.text()).toBe(
      'All downstream analysis tools, on your first 3 free private dataset submitted · No card required'
    )
  })

  it('labels each of the four stat tiles', () => {
    const labels = mount(ProHero, {
      props: { userCount: 1, datasetCount: 1, publicationCount: 1 },
    })
      .findAll('.pro-stats__label')
      .map((n) => n.text())
    expect(labels).toEqual(['researchers', 'datasets annotated', 'publications', 'engine published in Nature Methods'])
  })

  it('points the two hero CTAs at the in-page anchors', () => {
    const wrapper = mount(ProHero, {
      props: { userCount: 1, datasetCount: 1, publicationCount: 1 },
    })
    const buttons = wrapper.findAll('a.pro-btn')
    const hrefs = buttons.map((a) => a.attributes('href'))
    expect(hrefs).toContain('#plans')
    expect(hrefs).toContain('#analysis')
    expect(buttons.map((a) => a.text())).toEqual(['Submit your private dataset', 'Explore the analysis tools'])
  })
})
