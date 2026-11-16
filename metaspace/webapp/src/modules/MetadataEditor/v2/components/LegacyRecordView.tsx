/* eslint-disable camelcase */
import { defineComponent, PropType } from 'vue'
import moment from 'moment'
import { ElButton } from '../../../../lib/element-plus'
import copyToClipboard from '../../../../lib/copyToClipboard'
import { fieldsByLegacyPath, LEGACY_LABELS } from '../formDefinition'
import { FieldKey, FieldReport, LegacyMetadata, UnmappedRow } from '../types'
import { SectionRow } from './SectionRow'
import './V2Form.scss'

const GROUPS: { title: string; section: keyof LegacyMetadata; keys: string[] }[] = [
  {
    title: 'Sample information',
    section: 'Sample_Information',
    keys: ['Organism', 'Organism_Part', 'Condition', 'Sample_Growth_Conditions'],
  },
  {
    title: 'Sample preparation',
    section: 'Sample_Preparation',
    keys: ['Sample_Stabilisation', 'Tissue_Modification', 'MALDI_Matrix', 'MALDI_Matrix_Application', 'Solvent'],
  },
  {
    title: 'MS analysis',
    section: 'MS_Analysis',
    keys: ['Polarity', 'Ionisation_Source', 'Analyzer', 'Detector_Resolving_Power', 'Pixel_Size'],
  },
]

const PARTLY: Partial<Record<FieldKey, string>> = {
  maldi_matrix_application: 'MALDI matrix application + Protocol',
  solvent: 'Solvent + Protocol',
}

const EMPTY = '—'

/** keyboard focus ring for the tag buttons: same 2px primary ring, 2px offset as the section toggles */
const FOCUS_RING =
  'rounded-sm focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[color:var(--el-color-primary)] focus-visible:ring-offset-2'

const isBlank = (value: unknown): boolean => value == null || value === ''

/** One part of a numeric pair, or a dash when the legacy record left it out. */
const part = (value: unknown): string => (isBlank(value) ? EMPTY : String(value))

/**
 * Formats a legacy value for display. Numeric pairs may be partial or null in old records: a missing part shows
 * as a dash, and a pair with no part at all is empty.
 */
const renderValue = (key: string, value: unknown): string => {
  if (isBlank(value)) return EMPTY
  if (key === 'Detector_Resolving_Power' || key === 'Pixel_Size') {
    if (typeof value !== 'object') return String(value)
    const pair = value as Record<string, unknown>
    const [a, b] = key === 'Pixel_Size' ? [pair.Xaxis, pair.Yaxis] : [pair.Resolving_Power, pair.mz]
    if (isBlank(a) && isBlank(b)) return EMPTY
    return key === 'Pixel_Size' ? `${part(a)} × ${part(b)} µm` : `${part(a)} @ ${part(b)} m/z`
  }
  return String(value)
}

/**
 * "As recorded 17 Apr 2019 by L. Vieira · schema v1 · read-only" — one line next to the schema switch in the
 * legacy view (kept short so the switcher row never wraps).
 */
export const legacyProvenance = (uploadDT: string | null, submitterName: string | null): string => {
  const when = uploadDT && moment(uploadDT).isValid() ? moment(uploadDT).format('D MMM YYYY') : null
  return `${when ? `As recorded ${when}` : 'As recorded'}${
    submitterName ? ` by ${submitterName}` : ''
  } · schema v1 · read-only`
}

/** Downloads the legacy record as `<datasetId>-metadata-v1.json`. */
export const exportLegacyJson = (legacy: LegacyMetadata, datasetId: string): void => {
  if (typeof URL.createObjectURL !== 'function') return
  const blob = new Blob([JSON.stringify(legacy, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${datasetId}-metadata-v1.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Copies the legacy record as pretty-printed JSON. */
export const copyLegacyJson = (legacy: LegacyMetadata): void => {
  copyToClipboard(JSON.stringify(legacy, null, 2))
}

export const LegacyRecordView = defineComponent({
  name: 'LegacyRecordView',
  props: {
    legacy: { type: Object as PropType<LegacyMetadata>, required: true },
    fields: { type: Object as PropType<Partial<Record<FieldKey, FieldReport>>>, required: true },
    unmapped: { type: Array as PropType<UnmappedRow[]>, required: true },
    readOnlyProvenance: { type: Boolean, default: false },
    /** plain text of the dataset description, shown read-only as the first row */
    descriptionText: { type: String, default: '' },
  },
  emits: ['jump', 'search'],
  setup(props, { emit }) {
    const mappingTag = (legacyPath: string) => {
      if (props.readOnlyProvenance) return null
      const defs = fieldsByLegacyPath(legacyPath)
      if (legacyPath === 'MS_Analysis.Analyzer') {
        const report = props.fields.instrument_model
        if (report?.state === 'required-empty') {
          const raw = (report.source?.raw || '').trim()
          return (
            <span class="text-xs">
              <span class="v2-maptag--none" style="color: var(--el-color-danger)">
                <i class="v2-legend__dot" style="background: var(--el-color-danger)" aria-hidden="true" />
                no v2 field
              </span>
              {raw && (
                <ElButton link type="primary" size="small" class="v2-search ml-2" onClick={() => emit('search', raw)}>
                  ↗ Search "{raw}" models
                </ElButton>
              )}
            </span>
          )
        }
      }
      if (defs.length === 0 || props.unmapped.some((u) => u.legacyKey === legacyPath)) {
        return (
          <span class="text-xs">
            <span class="v2-maptag--none" style="color: var(--el-color-danger)">
              <i class="v2-legend__dot" style="background: var(--el-color-danger)" aria-hidden="true" />
              no v2 field
            </span>
          </span>
        )
      }
      const def = defs[0]
      const report = props.fields[def.key]
      const partly = PARTLY[def.key]
      const word = partly ? 'partly' : report?.state === 'migrated' ? 'mapped' : 'not migrated'
      const color = word === 'mapped' ? 'var(--el-color-success)' : 'var(--el-color-warning)'
      return (
        <button
          type="button"
          class={['v2-maptag text-xs bg-transparent border-0 p-0 cursor-pointer', FOCUS_RING]}
          style={{ color }}
          onClick={() => emit('jump', def.key)}
        >
          <i class="v2-legend__dot" style={{ background: color }} aria-hidden="true" />
          {word} → {partly || def.label}
        </button>
      )
    }

    return () => (
      <div class="v2-legacy section-rows">
        <SectionRow key="description" class="v2-legacy__description" title="Dataset description">
          <div class="v2-legacy__value v2-legacy__value--block">{props.descriptionText || '—'}</div>
        </SectionRow>
        {GROUPS.map((group) => {
          const section = (props.legacy[group.section] as Record<string, any>) || {}
          return (
            <SectionRow key={group.section} title={group.title}>
              <div class="v2-legacy__grid">
                {group.keys.map((key) => {
                  const text = renderValue(key, section[key])
                  return (
                    <div key={key} class="v2-legacy__item">
                      <div class="v2-legacy__label">{LEGACY_LABELS[`${group.section}.${key}`] || key}</div>
                      <div class="flex flex-col items-start gap-1">
                        <span class="v2-legacy__value">{text}</span>
                        {/* an empty legacy value maps to nothing, so it gets no tag */}
                        {text !== EMPTY && mappingTag(`${group.section}.${key}`)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionRow>
          )
        })}
      </div>
    )
  },
})
