// metaspace/webapp/src/modules/MetadataEditor/v2/components/LegacyRecordView.tsx
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

const renderValue = (key: string, value: any): string => {
  if (value == null || value === '') return EMPTY
  if (key === 'Detector_Resolving_Power') return `${value.Resolving_Power} @ ${value.mz} m/z`
  if (key === 'Pixel_Size') return `${value.Xaxis} × ${value.Yaxis} µm`
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
  emits: ['jump', 'copy', 'search'],
  setup(props, { emit }) {
    const mappingTag = (legacyPath: string) => {
      if (props.readOnlyProvenance) return null
      const defs = fieldsByLegacyPath(legacyPath)
      if (legacyPath === 'MS_Analysis.Analyzer') {
        const report = props.fields.instrument_model
        if (report?.state === 'required-empty') {
          return (
            <span class="text-xs">
              <span class="v2-maptag--none" style="color: var(--el-color-danger)">
                <i class="v2-legend__dot" style="background: var(--el-color-danger)" aria-hidden="true" />
                no v2 field
              </span>
              <ElButton
                link
                type="primary"
                size="small"
                class="v2-search ml-2"
                onClick={() => emit('search', report.source?.raw || '')}
              >
                ↗ Search "{report.source?.raw}" models
              </ElButton>
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
            {props.unmapped.some((u) => u.legacyKey === legacyPath) && (
              <ElButton link type="primary" size="small" class="v2-copy ml-2" onClick={() => emit('copy', legacyPath)}>
                ↗ Copy to…
              </ElButton>
            )}
          </span>
        )
      }
      const def = defs[0]
      const report = props.fields[def.key]
      const partly = PARTLY[def.key]
      const word = partly ? 'partly' : report?.state === 'migrated' ? 'mapped' : 'review'
      const color = word === 'mapped' ? 'var(--el-color-success)' : 'var(--el-color-warning)'
      return (
        <button
          type="button"
          class="v2-maptag text-xs bg-transparent border-0 p-0 cursor-pointer"
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
