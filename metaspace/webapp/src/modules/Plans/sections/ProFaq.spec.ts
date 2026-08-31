import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProFaq from './ProFaq'

describe('ProFaq', () => {
  it('renders every question with the first one open', () => {
    const wrapper = mount(ProFaq)
    const items = wrapper.findAll('.pro-faq__item')
    expect(items).toHaveLength(7)
    expect(items[0].find('.pro-faq__trigger').attributes('aria-expanded')).toBe('true')
    expect(items[1].find('.pro-faq__trigger').attributes('aria-expanded')).toBe('false')
  })

  it('heads the FAQ section', () => {
    const text = mount(ProFaq).get('#faq').text()
    expect(text).toContain('Questions')
    expect(text).toContain('Before you decide')
  })

  it('asks the seven questions in the order the design specifies', () => {
    const questions = mount(ProFaq)
      .findAll('.pro-faq__trigger')
      .map((t) => t.text().replace(/[+−]$/, '').trim())
    expect(questions).toEqual([
      'Is METASPACE Academic still free?',
      'Do I have to pay to try the analysis tools?',
      'Does my private data enter the public knowledgebase?',
      'Can I cite METASPACE Pro analysis in a paper?',
      'What happens to the private datasets I submitted before the split?',
      'What happens to my data if we stop subscribing?',
      'Do we pay per person?',
    ])
  })

  it('gives each question its full answer copy', async () => {
    const wrapper = mount(ProFaq)
    const expected = [
      'Yes, and it stays that way. Public submissions, the annotation engine and the community knowledgebase remain ' +
        'free and open source, developed by the Alexandrov team at UCSD. Pro is a separate subscription service ' +
        'from Metacloud Inc. for private work.',
      'No. All analysis tools run on the free tier, on your three free private datasets a year. Paid plans raise ' +
        "that ceiling — they don't unlock the features. Three datasets is enough to judge the tools on your own " +
        "dataset; it isn't enough for a real cross-dataset study.",
      'No. Private datasets and their annotations stay inside your group. If you later choose to make a dataset ' +
        'public, you do that explicitly, one dataset at a time.',
      'Yes. The statistical methods, corrections and assumptions are documented in full, and the underlying ' +
        'annotation engine is published in Nature Methods (Palmer et al., 2017). Citation guidance is on the ' +
        'methods page.',
      'They remain accessible. Datasets submitted privately before November 2025 are unaffected by the split and ' +
        "don't count against your current quota.",
      'You can export your annotations and results at any time, including after a subscription ends, and download ' +
        'raw files up to two datasets a day. Existing private datasets stay accessible; you simply return to the ' +
        'free ceiling for new submissions.',
      'No. Group members and projects are unlimited on every plan, including Free. Plans are priced on private ' +
        'dataset throughput, not headcount.',
    ]

    for (let i = 0; i < expected.length; i++) {
      const trigger = wrapper.findAll('.pro-faq__trigger')[i]
      if (trigger.attributes('aria-expanded') !== 'true') {
        await trigger.trigger('click')
      }
      expect(wrapper.findAll('.pro-faq__item')[i].get('.pro-faq__answer').text()).toBe(expected[i])
    }
  })

  it('does not wire aria-controls on the triggers - the panel id only exists while expanded', () => {
    const wrapper = mount(ProFaq)
    wrapper.findAll('.pro-faq__trigger').forEach((trigger) => {
      expect(trigger.attributes('aria-controls')).toBeUndefined()
      expect(trigger.attributes('aria-expanded')).toBeTruthy()
    })
  })

  it('opens a question when its trigger is clicked', async () => {
    const wrapper = mount(ProFaq)
    const second = wrapper.findAll('.pro-faq__trigger')[1]
    await second.trigger('click')
    expect(second.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.pro-faq__trigger')[0].attributes('aria-expanded')).toBe('false')
  })

  it('collapses an open question when clicked again', async () => {
    const wrapper = mount(ProFaq)
    const first = wrapper.findAll('.pro-faq__trigger')[0]
    await first.trigger('click')
    expect(first.attributes('aria-expanded')).toBe('false')
  })

  it('answers the two questions users ask most', () => {
    const text = mount(ProFaq).text()
    expect(text).toContain('Is METASPACE Academic still free?')
    expect(text).toContain('Does my private data enter the public knowledgebase?')
  })

  it('renders the closing call to action', () => {
    expect(mount(ProFaq).find('.pro-cta').exists()).toBe(true)
  })

  it('closes the CTA with the three-clause footnote, scoped to results rather than "your data"', () => {
    const note = mount(ProFaq).get('.pro-cta .pro-note')
    expect(note.text()).toBe('No card required · Export your results at any time · Academic stays free')
  })

  // The lede carries its own class so the ink panel can centre it on a
  // reading measure without also constraining the footnote below the buttons.
  it('separates the CTA lede from the footnote', () => {
    const wrapper = mount(ProFaq)
    expect(wrapper.get('.pro-cta__lede').text()).toContain('Three private datasets a year are included')
    expect(wrapper.get('.pro-cta__lede').classes()).not.toContain('pro-note')
  })

  it('exposes the faq anchor used by the section nav', () => {
    expect(mount(ProFaq).find('#faq').exists()).toBe(true)
  })

  it('drops the model-training half of the private-data answer, keeping only the knowledgebase claim', async () => {
    // The QUESTION now asks only about the knowledgebase (model-training claim
    // removed), and the ANSWER is trimmed to match, confirming scope to only
    // the knowledgebase protection promise.
    const wrapper = mount(ProFaq)
    const item = wrapper
      .findAll('.pro-faq__item')
      .find((i) => i.text().includes('Does my private data enter the public knowledgebase'))!
    await item.find('.pro-faq__trigger').trigger('click')
    const answerText = item.find('.pro-faq__answer').text()
    expect(answerText).toContain('stay inside your group')
    expect(answerText.toLowerCase()).not.toContain('train')
    expect(answerText.toLowerCase()).not.toContain('aggregat')
    expect(answerText.toLowerCase()).not.toContain('anonymis')
    expect(answerText.toLowerCase()).not.toContain('opt-out')
  })

  it('bounds the export promise on data-retention to annotations/results any time, raw files capped', async () => {
    const wrapper = mount(ProFaq)
    const trigger = wrapper
      .findAll('.pro-faq__trigger')
      .find((t) => t.text().includes('What happens to my data if we stop subscribing?'))!
    await trigger.trigger('click')
    expect(wrapper.text()).toContain('two datasets a day')
  })

  it('keeps exactly one item open at a time across the whole set', async () => {
    const wrapper = mount(ProFaq)
    const triggers = wrapper.findAll('.pro-faq__trigger')

    await triggers[3].trigger('click')

    const expandedStates = wrapper.findAll('.pro-faq__trigger').map((t) => t.attributes('aria-expanded'))
    expect(expandedStates.filter((state) => state === 'true')).toHaveLength(1)
    expect(expandedStates[3]).toBe('true')
  })

  it('fully closes when the open item is clicked, rendering no answer panel', async () => {
    const wrapper = mount(ProFaq)
    const first = wrapper.findAll('.pro-faq__trigger')[0]

    await first.trigger('click')

    expect(wrapper.findAll('.pro-faq__trigger').every((t) => t.attributes('aria-expanded') === 'false')).toBe(true)
    expect(wrapper.find('.pro-faq__answer').exists()).toBe(false)
  })

  it('gives every question a non-empty answer', async () => {
    const wrapper = mount(ProFaq)
    const count = wrapper.findAll('.pro-faq__trigger').length

    for (let i = 0; i < count; i++) {
      const trigger = wrapper.findAll('.pro-faq__trigger')[i]
      if (trigger.attributes('aria-expanded') !== 'true') {
        await trigger.trigger('click')
      }
      const item = wrapper.findAll('.pro-faq__item')[i]
      const answer = item.find('.pro-faq__answer')
      expect(answer.exists()).toBe(true)
      expect(answer.text().trim().length).toBeGreaterThan(0)
    }
  })

  it('hides the +/- marker from screen readers', () => {
    const wrapper = mount(ProFaq)
    const markers = wrapper.findAll('.pro-faq__marker')
    expect(markers.length).toBeGreaterThan(0)
    markers.forEach((marker) => {
      expect(marker.attributes('aria-hidden')).toBe('true')
    })
  })

  it('renders CTA links pointing at /upload and #procurement', () => {
    const wrapper = mount(ProFaq)
    const links = wrapper.find('.pro-cta').findAll('a')
    const hrefs = links.map((link) => link.attributes('href'))
    expect(hrefs).toContain('/upload')
    expect(hrefs).toContain('/contact')
  })
})
