/* eslint-disable camelcase */
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { V2Form } from './V2Form'
import { useMetadataV2Form } from '../useMetadataV2Form'

const legacyJson = JSON.stringify({
  Sample_Information: { Organism: 'Mus musculus', Organism_Part: 'Liver', Condition: 'Wildtype' },
  Sample_Preparation: {
    Sample_Stabilisation: 'Fresh frozen',
    Tissue_Modification: 'None',
    MALDI_Matrix: 'none',
    MALDI_Matrix_Application: 'TM-Sprayer',
  },
  MS_Analysis: {
    Polarity: 'Positive',
    Ionisation_Source: 'MALDI',
    Analyzer: 'Orbitrap',
    Detector_Resolving_Power: { mz: 200, Resolving_Power: 140000 },
    Pixel_Size: { Xaxis: 50, Yaxis: 50 },
  },
})

describe('V2Form', () => {
  it('renders both groups with required, recommended and advanced blocks for tissue', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const w = mount(V2Form, { props: { form } })
    await nextTick() // ElInput assigns its id from an onMounted watcher
    const labels = w.findAll('label').map((l) => l.text())
    expect(labels.some((t) => t.startsWith('Sample type'))).toBe(true)
    expect(labels.some((t) => t.startsWith('Anatomical site (coarse)'))).toBe(true)
    expect(labels.some((t) => t.startsWith('Cell line'))).toBe(false)
    expect(w.findAll('.v2-group__rule').map((r) => r.text())).toEqual(['RECOMMENDED', 'RECOMMENDED', 'ADVANCED'])
    expect(w.find('#v2-field-protocol_description').exists()).toBe(true)
    expect(w.find('.v2-group--sample').text()).toContain('Organism, tissue and preparation')
  })

  it('edits write through the form and polarity drives the reconciled value', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const w = mount(V2Form, { props: { form } })
    await nextTick() // ElInput assigns its id from an onMounted watcher
    const polarity = w.findAllComponents({ name: 'EnumField' }).find((c) => c.props('inputId') === 'v2-field-polarity')!
    polarity.vm.$emit('input', 'Negative')
    expect(form.envelope.value.document.acquisition.polarity.user_value.value_ontology_id).toBe('MS:1000129')
    const protocol = w.find('#v2-field-protocol_description')
    await protocol.setValue('hello')
    expect(form.envelope.value.document.sample.protocol_description).toBe('hello')
  })

  it('shows the Condition carry-over hint under health status and genetic background on legacy edit', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadDataset({ id: 'ds', metadataJson: legacyJson })
    const w = mount(V2Form, { props: { form } })
    const hints = w.findAllComponents({ name: 'CarryOverHint' })
    expect(hints).toHaveLength(2)
    hints[0].vm.$emit('use', 'genetic_background')
    await nextTick()
    expect(form.fields.value.genetic_background?.state).toBe('copied')
    expect(form.envelope.value.document.sample.genetic_background).toEqual({
      value_free_text: 'Wildtype',
      curation_state: 'pending_curation',
    })
  })

  it('focus requests scroll to and open the target field', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    // setupTests.ts stubs el-autocomplete globally; this spec needs the real component
    const w = mount(V2Form, {
      props: { form },
      attachTo: document.body,
      global: { stubs: { 'el-autocomplete': false, ElAutocomplete: false } },
    })
    const scroll = (Element.prototype.scrollIntoView = vi.fn())
    form.requestFocus('instrument_model', 'Orbitrap')
    await nextTick()
    await nextTick()
    expect(scroll).toHaveBeenCalled()
    const field = w
      .findAllComponents({ name: 'OntologyField' })
      .find((c) => c.props('inputId') === 'v2-field-instrument_model')!
    expect(field.findComponent({ name: 'ElAutocomplete' }).props('modelValue')).toBe('Orbitrap')
    w.unmount()
  })

  it('focus requested before mount is handled on mount', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const original = Element.prototype.scrollIntoView
    const scroll = (Element.prototype.scrollIntoView = vi.fn())
    form.requestFocus('organism', 'Mus')
    const w = mount(V2Form, {
      props: { form },
      attachTo: document.body,
      global: { stubs: { 'el-autocomplete': false, ElAutocomplete: false } },
    })
    await nextTick()
    await nextTick()
    expect(scroll).toHaveBeenCalled()
    const field = w
      .findAllComponents({ name: 'OntologyField' })
      .find((c) => c.props('inputId') === 'v2-field-organism')!
    expect(field.findComponent({ name: 'ElAutocomplete' }).props('modelValue')).toBe('Mus')
    w.unmount()
    Element.prototype.scrollIntoView = original
  })

  it('offers "Mark as reviewed" for a review-state textarea and acknowledges on click', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadDataset({ id: 'ds', metadataJson: legacyJson })
    expect(form.fields.value.protocol_description?.state).toBe('review')
    const w = mount(V2Form, { props: { form } })
    await nextTick()
    const row = w.find('#v2-field-protocol_description').element.closest('.v2-field')!
    const keep = row.querySelector('button.v2-chip__keep')
    expect(keep).not.toBeNull()
    ;(keep as HTMLElement).click()
    await nextTick()
    expect(form.acknowledged.value).toContain('protocol_description')
    expect(row.querySelector('button.v2-chip__keep')).toBeNull()
  })

  it('clears a handled focus request so a remount does not replay it', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const original = Element.prototype.scrollIntoView
    const scroll = (Element.prototype.scrollIntoView = vi.fn())
    const options = {
      props: { form },
      attachTo: document.body,
      global: { stubs: { 'el-autocomplete': false, ElAutocomplete: false } },
    }
    form.requestFocus('organism', 'Mus')
    const w = mount(V2Form, options)
    await nextTick()
    await nextTick()
    expect(form.focusRequest.value).toBeNull()
    w.unmount()
    const w2 = mount(V2Form, options)
    await nextTick()
    await nextTick()
    expect(scroll).toHaveBeenCalledTimes(1)
    w2.unmount()
    Element.prototype.scrollIntoView = original
  })

  it('scrolls to a non-ontology target requested before mount', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const original = Element.prototype.scrollIntoView
    const scroll = (Element.prototype.scrollIntoView = vi.fn())
    form.requestFocus('health_status')
    const w = mount(V2Form, { props: { form }, attachTo: document.body })
    await nextTick()
    await nextTick()
    expect(scroll).toHaveBeenCalled()
    w.unmount()
    Element.prototype.scrollIntoView = original
  })

  it('a focus request on a composite field focuses its first input (pixel size, resolving power)', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
    const w = mount(V2Form, { props: { form }, attachTo: document.body })
    for (const key of ['pixel_size', 'resolving_power'] as const) {
      form.requestFocus(key)
      await nextTick()
      await nextTick()
      const first = w.find(`#v2-field-${key} input`).element
      expect(document.activeElement).toBe(first)
    }
    w.unmount()
    Element.prototype.scrollIntoView = original
  })

  it('shows the sample type helper text, except when a migration hint takes its place', async () => {
    const help = 'Tissue · Cell culture · Plant · Environmental, or type another (goes to curation).'
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const w = mount(V2Form, { props: { form } })
    expect(w.find('[data-field-key="sample_type"] .md-field-help').text()).toContain(help)
    const legacy = useMetadataV2Form(async () => [])
    await legacy.loadDataset({ id: 'ds1', metadataJson: legacyJson })
    const w2 = mount(V2Form, { props: { form: legacy } })
    expect(w2.find('[data-field-key="sample_type"] .v2-hint').text()).toContain('inferred from legacy')
    expect(w2.find('[data-field-key="sample_type"] .md-field-help').exists()).toBe(false)
  })

  it('the sample type select can be cleared and switched', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const w = mount(V2Form, { props: { form } })
    const select = () =>
      w.findAllComponents({ name: 'EnumField' }).find((c) => c.props('inputId') === 'v2-field-sample_type')!
    expect(
      select()
        .props('options')
        .every((o: { disabled?: boolean }) => !o.disabled)
    ).toBe(true)
    // a new form has no default sample type: the select shows its placeholder
    expect(select().props('value')).toBeNull()
    select().vm.$emit('input', 'tissue')
    await nextTick()
    expect(form.envelope.value.document.sample.sample_type).toBe('tissue')
    select().vm.$emit('input', null)
    await nextTick()
    expect(form.envelope.value.document.sample.sample_type).toBeUndefined()
    expect(w.find('[data-field-key="sample_type"] .v2-field').classes()).toContain('is-error')
    expect(w.find('[data-field-key="sample_stabilisation"]').exists()).toBe(true)
    select().vm.$emit('input', 'cell_culture')
    await nextTick()
    expect(form.envelope.value.document.sample.sample_type).toBe('cell_culture')
    expect(w.find('[data-field-key="cell_line_id"]').exists()).toBe(true)
    expect(w.find('[data-field-key="sample_stabilisation"]').exists()).toBe(false)
  })

  it('renders resolving power and pixel size as inline pairs that write through the form', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const w = mount(V2Form, { props: { form } })
    const rp = w.find('#v2-field-resolving_power')
    expect(rp.text()).toContain('@')
    expect(rp.text()).toContain('m/z')
    const [power, mz] = rp.findAllComponents({ name: 'CustomNumberInput' })
    power.vm.$emit('update:modelValue', 70000)
    mz.vm.$emit('update:modelValue', 400)
    expect(form.envelope.value.unmodeled.Detector_Resolving_Power).toEqual({ mz: 400, Resolving_Power: 70000 })
    const px = w.find('#v2-field-pixel_size')
    expect(px.text()).toContain('µm')
    const [x, y] = px.findAllComponents({ name: 'CustomNumberInput' })
    x.vm.$emit('update:modelValue', 20)
    y.vm.$emit('update:modelValue', 25)
    expect(form.envelope.value.unmodeled.Pixel_Size).toEqual({ Xaxis: 20, Yaxis: 25 })
  })

  it('typing a new sample type shows the pending chip; × restores the select with the class value', async () => {
    const form = useMetadataV2Form(async () => [])
    await form.loadNew()
    const w = mount(V2Form, { props: { form } })
    const select = () =>
      w.findAllComponents({ name: 'EnumField' }).find((c) => c.props('inputId') === 'v2-field-sample_type')
    expect(select()!.props('allowCreate')).toBe(true)
    select()!.vm.$emit('input', 'Organoid')
    await nextTick()
    expect(form.envelope.value.unmodeled.sample_type_other).toEqual({
      value_free_text: 'Organoid',
      curation_state: 'pending_curation',
    })
    expect(select()).toBeUndefined()
    const field = w.find('[data-field-key="sample_type"]')
    const chip = field.find('.v2-chip.v2-chip--pending')
    expect(chip.text()).toContain('Organoid')
    expect(chip.text()).toContain('pending curation')
    expect(field.find('.v2-hint').text()).toBe('Stored for curation; the fields below follow the "Tissue" layout')
    expect(field.find('.v2-field').classes()).not.toContain('is-error')
    expect(w.find('[data-field-key="sample_stabilisation"]').exists()).toBe(true)

    await field.find('.v2-chip__clear').trigger('click')
    expect(form.envelope.value.unmodeled.sample_type_other).toBeUndefined()
    expect(select()!.props('value')).toBe('tissue')
    expect(w.find('[data-field-key="sample_type"] .v2-chip').exists()).toBe(false)
  })

  it('community free-text fields suggest values from 1 character; others keep the 3-char rule', async () => {
    const valueResolver = vi.fn(async (_key: string, q: string) => [{ label: `${q} value` }])
    const form = useMetadataV2Form(async () => [], valueResolver)
    await form.loadNew()
    const w = mount(V2Form, { props: { form } })
    const field = (key: string) =>
      w.findAllComponents({ name: 'OntologyField' }).find((c) => c.props('inputId') === `v2-field-${key}`)!
    for (const key of [
      'sample_stabilisation',
      'tissue_modification',
      'genetic_background',
      'maldi_matrix_application',
    ]) {
      expect(field(key).props('minQueryLength')).toBe(1)
      expect(await field(key).props('fetchValues')('fr')).toEqual([{ label: 'fr value' }])
      expect(valueResolver).toHaveBeenLastCalledWith(key, 'fr')
    }
    expect(field('organism').props('fetchValues')).toBeUndefined()
    expect(field('organism').props('minQueryLength')).toBe(3)
  })
})
