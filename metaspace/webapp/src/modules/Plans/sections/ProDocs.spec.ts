import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProDocs from './ProDocs'

describe('ProDocs', () => {
  it('exposes the docs anchor used by the section nav', () => {
    expect(mount(ProDocs).find('#docs').exists()).toBe(true)
  })

  it('heads the section and explains what each guide covers', () => {
    const text = mount(ProDocs).text()
    expect(text).toContain('Documentation')
    expect(text).toContain('Every step is written down')
    expect(text).toContain(
      'Each tool has a guide that walks the whole pipeline on a real dataset — what to click, which parameters ' +
        'matter, how to read the output and where the assumptions are.'
    )
  })

  // The tool names belong to the analysis section; repeating them as badges
  // above the guides added a step the design does not have.
  it('does not render a tool badge strip above the cards', () => {
    const wrapper = mount(ProDocs)
    expect(wrapper.find('.pro-docs-pipeline').exists()).toBe(false)
    expect(wrapper.findAll('.pro-docs-pipeline__step')).toHaveLength(0)
  })

  it('lays the guides out as one joined row rather than as free-standing tiles', () => {
    const wrapper = mount(ProDocs)
    const grid = wrapper.get('.pro-docs-cards')
    expect(grid.classes()).not.toContain('pro-cards')
    expect(grid.findAll('.pro-card')).toHaveLength(4)
  })

  it('renders the pipeline card plus one guide card per analysis tool, each with its kicker and title', () => {
    const cards = mount(ProDocs).findAll('.pro-card')
    expect(cards).toHaveLength(4)

    const kickers = cards.map((c) => c.get('.pro-eyebrow').text())
    expect(kickers).toEqual(['Pipeline', 'Guide', 'Guide', 'Guide'])

    const titles = cards.map((c) => c.get('.pro-h3').text())
    expect(titles).toEqual([
      'Private submission, end to end',
      'Differential analysis by region',
      'Spatial segmentation',
      'Cross-dataset statistics',
    ])
  })

  it('gives every card a non-empty body', () => {
    const bodies = mount(ProDocs)
      .findAll('.pro-docs-card__body')
      .map((b) => b.text().trim())
    expect(bodies).toHaveLength(4)
    bodies.forEach((body) => {
      expect(body.length).toBeGreaterThan(0)
    })
    expect(bodies).toEqual([
      'From imzML upload and the private toggle through annotation to a finished result.',
      'Drawing regions, choosing a correction, and reading p-values and effect sizes.',
      'Picking the number of segments and tracing each one back to its driver ions.',
      'Grouping datasets by condition.',
    ])
  })

  it('makes every card a link and closes with a link to the full documentation', () => {
    const wrapper = mount(ProDocs)
    wrapper.findAll('.pro-card').forEach((card) => {
      expect(card.element.tagName).toBe('A')
      expect(card.attributes('href')).toBeTruthy()
    })
    const trailing = wrapper.findAll('a').find((a) => a.text() === 'Browse the full documentation →')
    expect(trailing).toBeTruthy()
    expect(trailing!.attributes('href')).toBeTruthy()
  })

  it('does not make any publication or citability claim', () => {
    const text = mount(ProDocs).text()
    expect(text.toLowerCase()).not.toContain('citab')
    expect(text.toLowerCase()).not.toContain('publish')
  })
})
