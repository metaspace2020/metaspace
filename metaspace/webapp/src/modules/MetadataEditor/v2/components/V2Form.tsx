/* eslint-disable camelcase */
import { defineComponent, nextTick, PropType, ref, toRaw, watch } from 'vue'
import { ElForm, ElInput } from '../../../../lib/element-plus'
import CustomNumberInput from '../../inputs/CustomNumberInput.vue'
import { CURATED_VALUES } from '../curatedValues'
import { getAtPath, isTermEmpty, POLARITY_TERMS, termText } from '../envelope'
import { FieldDef, FieldTier, fieldByKey, requiredFor } from '../formDefinition'
import { MetadataV2Form } from '../useMetadataV2Form'
import { FieldKey, PixelSizeValue, ResolvingPower, SampleType } from '../types'
import { EnumField } from './EnumField'
import { FieldRow } from './FieldRow'
import { OntologyField } from './OntologyField'
import { SectionRow } from './SectionRow'
import './V2Form.scss'

const GROUPS: { key: 'sample' | 'acquisition'; title: string; help: string }[] = [
  { key: 'sample', title: 'Sample', help: 'Organism, tissue and preparation. Fields shown depend on sample type' },
  { key: 'acquisition', title: 'Acquisition', help: 'Instrument, ionisation and imaging settings' },
]
const TIERS: { tier: FieldTier; rule: string | null }[] = [
  { tier: 'core', rule: null },
  { tier: 'recommended', rule: 'RECOMMENDED' },
  { tier: 'advanced', rule: 'ADVANCED' },
]

const SAMPLE_TYPE_HELP =
  'Tissue · Cell culture · Plant · Environmental, or type another (goes to curation). Changes the fields below.'

const FOCUSABLE = 'input:not([type="hidden"]), textarea, select, button, [tabindex]:not([tabindex="-1"])'
const FOCUSABLE_DESCENDANT = 'input:not([type="hidden"]), textarea, [tabindex]:not([tabindex="-1"])'

/**
 * The element a focus request should focus: the target itself when it is a control, otherwise its first
 * focusable descendant (composite editors such as pixel size carry the field id on a wrapper div).
 */
const focusableIn = (el: Element | null | undefined): HTMLElement | null => {
  if (!el) return null
  if (el.matches(FOCUSABLE)) return el as HTMLElement
  return el.querySelector<HTMLElement>(FOCUSABLE_DESCENDANT)
}

const inputIdFor = (key: FieldKey) => `v2-field-${key}`

export const V2Form = defineComponent({
  name: 'V2Form',
  props: {
    form: { type: Object as PropType<MetadataV2Form>, required: true },
  },
  setup(props) {
    // toRaw: a reactive() props wrapper (e.g. test-utils) would auto-unwrap the form's refs
    const getForm = () => toRaw(props.form)
    const ontologyRefs = ref<Partial<Record<FieldKey, any>>>({})

    // requestFocus may fire before this component mounts (legacy view -> v2), so the watch runs immediately
    let handledSeq = 0
    watch(
      () => getForm().focusRequest.value,
      async (req) => {
        if (!req || req.seq === handledSeq) return
        handledSeq = req.seq
        await nextTick()
        const el = document.getElementById(inputIdFor(req.key))
        const field = ontologyRefs.value[req.key]
        // the control's id is applied by Element Plus a tick after mount, so fall back to the field's own root
        const target: Element | null = el || field?.$el || document.querySelector(`[data-field-key="${req.key}"]`)
        const row = target?.closest('.v2-field') || target
        row?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        if (field?.open) {
          field.open(req.prefill)
        } else {
          focusableIn(el || target)?.focus?.()
        }
        // handled: clear so a later remount of this component does not replay it
        getForm().focusRequest.value = null
      },
      { immediate: true, flush: 'post' }
    )

    // read at emit time so two edits within one render tick do not overwrite each other
    const currentRp = (): ResolvingPower =>
      getAtPath<ResolvingPower | undefined>(getForm().envelope.value, fieldByKey('resolving_power').path) || {
        mz: null,
        Resolving_Power: null,
      }
    const currentPx = (): PixelSizeValue =>
      getAtPath<PixelSizeValue | undefined>(getForm().envelope.value, fieldByKey('pixel_size').path) || {
        Xaxis: null,
        Yaxis: null,
      }

    /**
     * Composite numerics (resolving power, pixel size): each input is flagged empty on its own, and the pair is
     * `--partial` when only some parts are filled, so the required-empty border lands on the empty input(s) only.
     */
    const numClass = (part: number | null | undefined): (string | Record<string, boolean>)[] => [
      'v2-inline__num',
      { 'v2-inline__num--empty': part == null },
    ]
    const inlineClass = (parts: (number | null | undefined)[]): (string | Record<string, boolean>)[] => {
      const empty = parts.filter((part) => part == null).length
      return ['v2-inline', { 'v2-inline--partial': empty > 0 && empty < parts.length }]
    }

    /**
     * Sample type: the curated classes, or a typed value kept for curation (amber chip) while the class
     * value keeps driving the layout. × on the chip drops the typed value and shows the select again.
     */
    const renderSampleType = (def: FieldDef, id: string, value: SampleType | undefined) => {
      const form = getForm()
      const options = def.enumOptions!
      const other = form.envelope.value.unmodeled.sample_type_other
      if (other && !isTermEmpty(other)) {
        const label = termText(other)
        const layout = options.find((o) => o.value === form.sampleType.value)?.label || form.sampleType.value
        return (
          <>
            <div class="flex flex-wrap items-center gap-1">
              <span id={id} class="v2-chip v2-chip--pending" data-testid="sample-type-other">
                <span class="v2-chip__body">
                  <i class="v2-chip__dot" aria-hidden="true" />
                  <span class="v2-chip__label">{label}</span>
                  <span class="v2-chip__id">pending curation</span>{' '}
                  <span class="v2-chip__mark" aria-hidden="true">
                    ✎
                  </span>
                </span>
                <button
                  type="button"
                  class="v2-chip__clear"
                  aria-label="Clear value"
                  onClick={() => form.setSampleType(form.sampleType.value)}
                >
                  ×
                </button>
              </span>
            </div>
            <div class="v2-hint">Stored for curation; the fields below follow the "{layout}" layout</div>
          </>
        )
      }
      // the migration hint ("inferred from legacy …") takes the helper line's place
      const report = form.fields.value.sample_type
      const hasHint = !!(report?.note || report?.source?.raw)
      return (
        <>
          <EnumField
            inputId={id}
            value={value ?? null}
            options={options}
            placeholder={def.placeholder}
            allowCreate
            onInput={(v: string | null) => {
              if (v == null || options.some((o) => o.value === v)) {
                form.setSampleType(v as SampleType | null)
              } else {
                form.setSampleTypeOther(v)
              }
            }}
          />
          {!hasHint && <div class="md-field-help v2-sample-type-help">{SAMPLE_TYPE_HELP}</div>}
        </>
      )
    }

    const renderEditor = (def: FieldDef) => {
      const form = getForm()
      const value = getAtPath<any>(form.envelope.value, def.path)
      const id = inputIdFor(def.key)
      switch (def.editor) {
        case 'enum':
          if (def.key === 'polarity') {
            return (
              <EnumField
                inputId={id}
                value={form.polarity.value}
                options={def.enumOptions!}
                placeholder={def.placeholder}
                onInput={(v: 'Positive' | 'Negative' | null) =>
                  form.setField('polarity', v ? POLARITY_TERMS[v] : { curation_state: 'pending_curation' })
                }
              />
            )
          }
          if (def.key === 'sample_type') {
            return renderSampleType(def, id, value)
          }
          return (
            <EnumField
              inputId={id}
              value={value ?? null}
              options={def.enumOptions!}
              placeholder={def.placeholder}
              onInput={(v: string | null) => form.setField(def.key, v || undefined)}
            />
          )
        case 'ontology':
        case 'freeText':
          return (
            <OntologyField
              ref={(el: any) => (ontologyRefs.value[def.key] = el)}
              inputId={id}
              value={value ?? null}
              slot={def.editor === 'ontology' ? def.slot : undefined}
              fetchValues={(query: string) => form.valueResolver(def.key, query)}
              // the curated / community value lists are short, so they are worth showing from the first character
              minQueryLength={def.valueSource === 'community' ? 1 : undefined}
              knownValues={(def.valueSource === 'community' && CURATED_VALUES[def.key]) || []}
              placeholder={def.placeholder}
              fetchTerms={form.resolver}
              curationStatus={form.curationStatus.value[def.key]}
              onInput={(v: any) => form.setField(def.key, v)}
            />
          )
        case 'textarea':
          return (
            <ElInput
              id={id}
              type="textarea"
              autosize={{ minRows: 2, maxRows: 6 }}
              modelValue={value || ''}
              placeholder={def.placeholder}
              onUpdate:modelValue={(v: string) => form.setField(def.key, v || null)}
            />
          )
        case 'integer':
          return (
            <CustomNumberInput
              id={id}
              value={value ?? null}
              precision={0}
              onUpdate:modelValue={(v: number | null) => form.setField(def.key, v)}
            />
          )
        case 'resolvingPower': {
          const rp: ResolvingPower = value || { mz: null, Resolving_Power: null }
          return (
            <div id={id} class={inlineClass([rp.Resolving_Power, rp.mz])}>
              <CustomNumberInput
                class={numClass(rp.Resolving_Power)}
                style="width: 86px"
                value={rp.Resolving_Power}
                precision={0}
                aria-label="Resolving power"
                onUpdate:modelValue={(v: number | null) =>
                  form.setField('resolving_power', { ...currentRp(), Resolving_Power: v })
                }
              />
              <span class="v2-inline__sep">@</span>
              <CustomNumberInput
                class={numClass(rp.mz)}
                style="width: 64px"
                value={rp.mz}
                precision={0}
                aria-label="at m/z"
                onUpdate:modelValue={(v: number | null) => form.setField('resolving_power', { ...currentRp(), mz: v })}
              />
              <span class="v2-inline__unit">m/z</span>
            </div>
          )
        }
        case 'pixelSize': {
          const px: PixelSizeValue = value || { Xaxis: null, Yaxis: null }
          return (
            <div id={id} class={inlineClass([px.Xaxis, px.Yaxis])}>
              <CustomNumberInput
                class={numClass(px.Xaxis)}
                style="width: 86px"
                value={px.Xaxis}
                aria-label="Pixel size x"
                onUpdate:modelValue={(v: number | null) => form.setField('pixel_size', { ...currentPx(), Xaxis: v })}
              />
              <span class="v2-inline__sep">×</span>
              <CustomNumberInput
                class={numClass(px.Yaxis)}
                style="width: 64px"
                value={px.Yaxis}
                aria-label="Pixel size y"
                onUpdate:modelValue={(v: number | null) => form.setField('pixel_size', { ...currentPx(), Yaxis: v })}
              />
              <span class="v2-inline__unit">µm</span>
            </div>
          )
        }
        default:
          return null
      }
    }

    return () => {
      const form = getForm()
      const required = new Set(requiredFor(form.sampleType.value).map((f) => f.key))
      // after a submit attempt every still-empty required field is highlighted, not only migrated gaps
      const missing = new Set(form.submitAttempted.value ? form.status.value.missingRequired.map((f) => f.key) : [])
      return (
        <ElForm labelPosition="top" class="v2-form section-rows" onSubmit={(e: Event) => e.preventDefault()}>
          {GROUPS.map((group) => {
            const fields = form.visibleFields.value.filter((f) => f.group === group.key)
            return (
              <SectionRow
                class={['v2-group', `v2-group--${group.key}`]}
                key={group.key}
                title={group.title}
                help={group.help}
              >
                <div class="v2-group__grid">
                  {TIERS.map(({ tier, rule }) => {
                    const tierFields = fields.filter((f) => f.tier === tier)
                    if (tierFields.length === 0) return null
                    return [
                      rule && (
                        <div class="v2-group__rule" key={`${group.key}-${tier}`}>
                          {rule}
                        </div>
                      ),
                      ...tierFields.map((def) => (
                        <div key={def.key} data-field-key={def.key} class={{ 'v2-field--full': def.fullWidth }}>
                          <FieldRow
                            def={def}
                            report={form.fields.value[def.key]}
                            error={form.fieldErrors.value[def.key]}
                            required={required.has(def.key)}
                            showRequired={missing.has(def.key)}
                            inputId={inputIdFor(def.key)}
                          >
                            {renderEditor(def)}
                          </FieldRow>
                        </div>
                      )),
                    ]
                  })}
                </div>
              </SectionRow>
            )
          })}
        </ElForm>
      )
    }
  },
})
