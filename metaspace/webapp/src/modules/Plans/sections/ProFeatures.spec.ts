import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProFeatures from './ProFeatures'

describe('ProFeatures', () => {
  it('renders the three analysis rows, each with a chart', () => {
    const wrapper = mount(ProFeatures)
    expect(wrapper.findAll('.pro-feature')).toHaveLength(3)
    expect(wrapper.findAll('.pro-chart')).toHaveLength(3)
  })

  it('names the three analysis capabilities', () => {
    const text = mount(ProFeatures).text()
    expect(text).toContain('Differential analysis by region')
    expect(text).toContain('Spatial segmentation')
    expect(text).toContain('Cross-dataset statistics')
  })

  it('links the Academic banner to the split explainer', () => {
    const wrapper = mount(ProFeatures)
    const link = wrapper.find('.pro-callout--blue a')
    expect(link.attributes('href')).toBe('/split')
    expect(link.text()).toBe('Why we split →')
  })

  it('frames the gap between finished annotations and an answer', () => {
    const text = mount(ProFeatures).text()
    expect(text).toContain('The gap')
    expect(text).toContain('Your annotations are done. Now what?')
    expect(text).toContain(
      'You have forty datasets, twelve thousand annotations and a hypothesis. Today that means a CSV export, three ' +
        'weeks of scripting, and a pipeline nobody else in the lab can rerun.'
    )
    expect(text).toContain('METASPACE Pro closes that gap inside the browser, on the annotations you already trust.')
  })

  it('heads the analysis section and captions the rail', () => {
    const section = mount(ProFeatures).get('#analysis')
    expect(section.text()).toContain('How it works')
    expect(section.text()).toContain('From imzML to answer, without an export')
    expect(section.text()).toContain('Three questions your annotations can now answer')
  })

  // The caption is a styled label pointing at the three feature rows (centred
  // mono caps with a down arrow), not a paragraph of body copy, so it carries
  // a class instead of inline type styles.
  it('marks the rail caption up as a caption', () => {
    const caption = mount(ProFeatures).get('.pro-tools-caption')
    expect(caption.text()).toBe('Three questions your annotations can now answer')
    expect(caption.attributes('style')).toBeUndefined()
  })

  it('names each rail step with its title and body', () => {
    const steps = mount(ProFeatures)
      .findAll('.pro-rail__step')
      .map((s) => s.text())
    expect(steps[0]).toContain('Upload')
    expect(steps[0]).toContain('Your imzML, the same upload page')
    expect(steps[0]).toContain(
      'Nothing new to install. One toggle marks the dataset private and keeps it inside your group.'
    )
    expect(steps[1]).toContain('Annotate')
    expect(steps[1]).toContain('The engine you already trust')
    expect(steps[1]).toContain('Identical annotation engine, identical FDR control, scored against the same databases.')
    expect(steps[2]).toContain('Analyse')
    expect(steps[2]).toContain('Ask the question here')
    expect(steps[2]).toContain(
      'Draw regions, segment the tissue, or pull the whole experiment into one test — in the browser.'
    )
  })

  it('gives each analysis row its question, body, "Instead of:" line and figure caption', () => {
    const rows = mount(ProFeatures).findAll('.pro-feature')

    expect(rows[0].text()).toContain('“Which metabolites actually differ?”')
    expect(rows[0].text()).toContain(
      'Draw a region of interest on the tissue. Get the metabolites that differ between regions, with corrected ' +
        'p-values and effect sizes you can drop straight into a figure.'
    )
    expect(rows[0].get('.pro-feature__instead').text()).toBe(
      'Instead of: exporting masks, running ad-hoc t-tests, and hoping nobody asks about multiple testing.'
    )
    expect(rows[0].text()).toContain('Volcano plot + linked ion image · real tissue section, real annotations')

    expect(rows[1].text()).toContain('“Where are the compartments?”')
    expect(rows[1].text()).toContain(
      'Find the compartments your tissue actually has, not the ones you drew by eye. Every segment links back to ' +
        'the annotations that define it.'
    )
    expect(rows[1].get('.pro-feature__instead').text()).toBe(
      'Instead of: clustering in a separate tool, then hand-mapping clusters back to ions.'
    )
    expect(rows[1].text()).toContain('Segment map + per-segment driver ions')

    expect(rows[2].text()).toContain('“Does it hold across experiments?”')
    expect(rows[2].get('.pro-feature__instead').text()).toBe(
      'Instead of: the comparison you keep postponing because the bookkeeping is worse than the science.'
    )
    expect(rows[2].text()).toContain('Cross-dataset heatmap · conditions × annotations, batch-corrected')
  })

  it('emphasises only the "Instead of:" label, leaving the rest of the line unbolded', () => {
    const insteads = mount(ProFeatures).findAll('.pro-feature__instead')
    expect(insteads).toHaveLength(3)
    insteads.forEach((line) => {
      expect(line.get('b').text()).toBe('Instead of:')
    })
  })

  it('states exactly the two privacy guarantees', () => {
    const wrapper = mount(ProFeatures)
    const privacy = wrapper.get('#privacy')
    const text = privacy.text()
    expect(text).toContain('Private by design')
    expect(text).toContain('Your data never touches the public database until you say so')
    expect(text).toContain('Two guarantees, in plain terms, with no asterisks.')
    expect(text).toContain('Nothing enters the knowledgebase')
    expect(text).toContain(
      'Your datasets and annotations stay inside your group until you explicitly choose to publish them. Nothing ' +
        'is contributed to the public knowledgebase on your behalf.'
    )
    expect(text).toContain('Nothing is locked in')
    expect(text).not.toContain('Nothing trains a model')
    expect(wrapper.find('#privacy .pro-grid').findAll('.pro-h3')).toHaveLength(2)
  })

  // The pair is one joined unit spanning the shell, not two boxes capped to
  // half the container - the width cap that did that is gone.
  it('lets the privacy pair span the full content width', () => {
    const grid = mount(ProFeatures).get('#privacy .pro-grid')
    expect(grid.classes()).not.toContain('pro-grid--two')
  })

  it('bounds the export promise to annotations/results any time, raw files capped at two datasets a day', () => {
    const text = mount(ProFeatures).get('#privacy').text()
    expect(text).toContain(
      'Export your annotations and results at any time, on any plan — including after a subscription ends. Raw ' +
        'files download too, up to two datasets a day. Your science stays yours.'
    )
  })

  it('exposes the analysis anchor used by the hero CTA', () => {
    expect(mount(ProFeatures).find('#analysis').exists()).toBe(true)
  })

  it('exposes the privacy anchor', () => {
    expect(mount(ProFeatures).find('#privacy').exists()).toBe(true)
  })

  it('renders a distinct chart kind for each of the three feature rows', () => {
    const wrapper = mount(ProFeatures)
    const rows = wrapper.findAll('.pro-feature')
    expect(rows).toHaveLength(3)

    const kinds = rows.map((row) => {
      const svg = row.find('.pro-chart__svg')
      // volcano draws <circle>, segmentation and heatmap draw <rect> distinguished
      // by element count/shape below, so key off distinctive drawn markup instead.
      return svg.exists() ? svg.html() : ''
    })

    // Each row's chart should draw genuinely different SVG content.
    expect(new Set(kinds).size).toBe(3)

    // More directly: the three ProChart instances should be given three
    // different `kind` props, one each of volcano/segmentation/heatmap.
    const charts = wrapper.findAllComponents({ name: 'ProChart' })
    expect(charts).toHaveLength(3)
    const propKinds = charts.map((c) => c.props('kind')).sort()
    expect(propKinds).toEqual(['heatmap', 'segmentation', 'volcano'])
  })

  it('applies the flip modifier only to the middle feature row', () => {
    const wrapper = mount(ProFeatures)
    const rows = wrapper.findAll('.pro-feature')
    expect(rows).toHaveLength(3)
    expect(rows[0].classes()).not.toContain('pro-feature--flip')
    expect(rows[1].classes()).toContain('pro-feature--flip')
    expect(rows[2].classes()).not.toContain('pro-feature--flip')
  })

  it('renders exactly 3 rail steps and 2 rail arrows', () => {
    const wrapper = mount(ProFeatures)
    expect(wrapper.findAll('.pro-rail__step')).toHaveLength(3)
    expect(wrapper.findAll('.pro-rail__arrow')).toHaveLength(2)
  })

  it('lays the rail out as step, arrow, step, arrow, step in document order', () => {
    const wrapper = mount(ProFeatures)
    const rail = wrapper.get('.pro-rail')
    const children = Array.from(rail.element.children)
    const sequence = children.map((el) =>
      el.classList.contains('pro-rail__arrow') ? 'arrow' : el.classList.contains('pro-rail__step') ? 'step' : 'other'
    )
    expect(sequence).toEqual(['step', 'arrow', 'step', 'arrow', 'step'])
  })

  it('marks only the third rail step (Analyse) with the accent modifier', () => {
    const wrapper = mount(ProFeatures)
    const steps = wrapper.findAll('.pro-rail__step')
    expect(steps).toHaveLength(3)
    expect(steps[0].classes()).not.toContain('pro-rail__step--accent')
    expect(steps[1].classes()).not.toContain('pro-rail__step--accent')
    expect(steps[2].classes()).toContain('pro-rail__step--accent')
  })
})
