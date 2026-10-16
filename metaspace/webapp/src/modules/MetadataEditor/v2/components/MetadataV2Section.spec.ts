import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { MetadataV2Section } from './MetadataV2Section'
import { useMetadataV2Form } from '../useMetadataV2Form'

const legacyJson = JSON.stringify({
  Sample_Information: { Organism: 'Mus musculus', Organism_Part: 'Liver', Condition: 'Wildtype' },
  Sample_Preparation: {
    Sample_Stabilisation: 'Fresh frozen',
    Tissue_Modification: 'None',
    MALDI_Matrix: 'none',
    MALDI_Matrix_Application: 'none',
  },
  MS_Analysis: {
    Polarity: 'Positive',
    Ionisation_Source: 'MALDI',
    Analyzer: 'Orbitrap',
    Detector_Resolving_Power: { mz: 200, Resolving_Power: 140000 },
    Pixel_Size: { Xaxis: 50, Yaxis: 50 },
  },
})
describe('MetadataV2Section', () => {
  it('new upload: counter, no banner, no switcher, description row first', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const w = mount(MetadataV2Section, {
      props: { form },
      slots: { description: '<div id="desc">D</div>' },
    })
    // only the default resolving power: a new form has no sample type until one is picked
    expect(w.text()).toContain('1 of 10 required')
    expect(w.findComponent({ name: 'MigrationBanner' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'SchemaSwitch' }).exists()).toBe(false)
    expect(w.find('.section-card__toggle').text()).toContain('Metadata')
    expect(w.find('.section-card__toggle').text()).toContain('— sample and acquisition')
    const first = w.find('.section-card__body > :first-child')
    expect(first.classes()).toContain('v2-description')
    expect(first.find('.section-row__title').text()).toBe('Description')
    expect(first.find('#desc').exists()).toBe(true)
  })

  it('legacy edit: switcher; switching views keeps the body state', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadDataset({ id: 'ds', metadataJson: legacyJson })
    const w = mount(MetadataV2Section, { props: { form } })
    expect(w.findComponent({ name: 'MigrationBanner' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'SchemaSwitch' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'V2Form' }).exists()).toBe(true)
    form.view.value = 'legacy'
    await nextTick()
    expect(w.findComponent({ name: 'LegacyRecordView' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'V2Form' }).exists()).toBe(false)
    w.findComponent({ name: 'LegacyRecordView' }).vm.$emit('jump', 'organism')
    await nextTick()
    expect(form.view.value).toBe('v2')
    expect(form.focusRequest.value?.key).toBe('organism')
  })

  it('legacy edit: legend, switcher first; legacy view has the hatched variant, tag and export', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadDataset({ id: 'ds', metadataJson: legacyJson, uploadDT: '2019-04-17T10:00:00Z' })
    const w = mount(MetadataV2Section, {
      props: { form },
      slots: { description: '<div id="desc">D</div>' },
    })
    const right = w.find('.section-card__right')
    expect(right.text()).toContain('New in v2')
    expect(right.text()).toMatch(/\d+ of \d+ required/)
    expect(w.find('.section-card__body > :first-child').classes()).toContain('v2-switch')
    expect(w.find('#desc').exists()).toBe(true)
    expect(w.find('.section-card__subtitle').text()).toContain('sample and acquisition')
    const switchEl = w.find('.v2-switch').element

    form.view.value = 'legacy'
    await nextTick()
    // the switcher is patched in place, not remounted, so it does not move or lose focus
    expect(w.find('.v2-switch').element).toBe(switchEl)
    expect(w.find('.section-card').classes()).toContain('section-card--legacy')
    expect(w.text()).toContain('LEGACY · READ-ONLY')
    expect(w.find('.v2-switch__note').text()).toBe('As recorded 17 Apr 2019 · schema v1 · read-only')
    // the legacy header has no subtitle; the switcher stays the first row of the body
    expect(w.find('.section-card__subtitle').exists()).toBe(false)
    expect(w.find('.section-card__body > :first-child').classes()).toContain('v2-switch')
    expect(w.find('.section-card__right').text()).toContain('Export JSON')
    expect(w.find('.section-card__right').text()).toContain('Copy all')
    expect(w.find('.section-card__right').text()).not.toContain('New in v2')
    expect(w.find('#desc').exists()).toBe(false)
  })

  it('renders headerActions before the required counter without toggling the card', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const w = mount(MetadataV2Section, {
      props: { form },
      slots: { headerActions: '<button id="copy-ds">Copy from another dataset…</button>' },
    })
    const right = w.find('.section-card__right')
    const html = right.html()
    expect(html.indexOf('copy-ds')).toBeGreaterThan(-1)
    expect(html.indexOf('copy-ds')).toBeLessThan(html.indexOf('required'))
    expect(w.find('.section-card__toggle').find('#copy-ds').exists()).toBe(false)
    await w.find('#copy-ds').trigger('click')
    expect(w.find('.section-card__body').exists()).toBe(true)
  })

  it('passes the description text to the legacy view', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadDataset({ id: 'ds', metadataJson: legacyJson })
    const w = mount(MetadataV2Section, {
      props: { form, descriptionText: 'Mouse liver' },
    })
    form.view.value = 'legacy'
    await nextTick()
    expect(w.find('.v2-legacy__description').text()).toContain('Mouse liver')
  })

  it('a focus request into the collapsed card expands it so V2Form can focus the field', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadDataset({ id: 'ds', metadataJson: legacyJson })
    const w = mount(MetadataV2Section, { props: { form }, attachTo: document.body })
    await w.find('.section-card__toggle').trigger('click')
    expect(w.find('.section-card__body').exists()).toBe(false)
    form.requestFocus('organism')
    await nextTick()
    await nextTick()
    expect(w.find('.section-card__toggle').attributes('aria-expanded')).toBe('true')
    expect(w.findComponent({ name: 'V2Form' }).exists()).toBe(true)
    // V2Form handled (and cleared) the request after mounting
    await nextTick()
    expect(form.focusRequest.value).toBeNull()
    w.unmount()
  })
})
