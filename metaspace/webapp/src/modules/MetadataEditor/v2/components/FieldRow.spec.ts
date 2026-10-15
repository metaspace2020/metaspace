import { mount } from '@vue/test-utils'
import { FieldRow } from './FieldRow'
import { fieldByKey } from '../formDefinition'

describe('FieldRow', () => {
  it('renders label, required mark, provenance word and legacy hint', () => {
    const w = mount(FieldRow, {
      props: {
        def: fieldByKey('organism'),
        required: true,
        inputId: 'f-organism',
        report: {
          state: 'migrated',
          source: { legacyKey: 'Sample_Information.Organism', raw: 'Mus musculus (mouse)' },
        },
      },
      slots: { default: '<input id="f-organism" />' },
    })
    expect(w.find('label').text()).toContain('Organism')
    expect(w.find('.v2-required').exists()).toBe(true)
    expect(w.find('.v2-prov--migrated').text()).toBe('migrated')
    expect(w.find('.v2-hint').text()).toBe('from legacy "Mus musculus (mouse)"')
  })

  it('shows an empty required field in red with a "Required" hint after a submit attempt', () => {
    const w = mount(FieldRow, {
      props: { def: fieldByKey('organism'), required: true, showRequired: true, inputId: 'f-organism' },
      slots: { default: '<input id="f-organism" />' },
    })
    expect(w.find('.v2-field').classes()).toContain('is-error')
    expect(w.find('.v2-hint--danger').text()).toBe('Required')
    expect(w.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('renders required-empty as an error with aria-invalid and the note', () => {
    const w = mount(FieldRow, {
      props: {
        def: fieldByKey('instrument_model'),
        required: true,
        inputId: 'f-im',
        report: { state: 'required-empty', note: 'legacy "Analyzer: Orbitrap" is an analyzer type' },
      },
      slots: { default: '<input id="f-im" />' },
    })
    expect(w.find('.v2-prov--required-empty').text()).toBe('required, empty')
    expect(w.find('.el-form-item').classes()).toContain('is-error')
    expect(w.find('input').attributes('aria-invalid')).toBe('true')
    expect(w.text()).toContain('analyzer type')
  })

  it('shows copied · review, new in v2 and server errors', async () => {
    const copied = mount(FieldRow, {
      props: { def: fieldByKey('disease'), required: false, inputId: 'a', report: { state: 'copied' } },
    })
    expect(copied.find('.v2-prov--copied').text()).toBe('copied · review')
    const fresh = mount(FieldRow, {
      props: { def: fieldByKey('sex'), required: false, inputId: 'b', report: { state: 'new' } },
    })
    expect(fresh.find('.v2-prov--new').text()).toBe('new in v2')
    const err = mount(FieldRow, {
      props: { def: fieldByKey('organism'), required: true, inputId: 'c', error: 'too short' },
    })
    // ElFormItem shows its error message through a 100ms debounced validate state
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(err.find('.el-form-item__error').text()).toBe('too short')
  })
})
