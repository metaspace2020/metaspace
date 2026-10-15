import { defineComponent, PropType, ref, toRaw, watch } from 'vue'
import { ElButton, ElTag } from '../../../../lib/element-plus'
import { MetadataV2Form } from '../useMetadataV2Form'
import { FieldKey, FieldReport } from '../types'
import { copyLegacyJson, exportLegacyJson, LegacyRecordView, legacyProvenance } from './LegacyRecordView'
import { RequiredCounter, SectionCard } from './SectionCard'
import { SectionRow } from './SectionRow'
import { SchemaSwitch } from './SchemaSwitch'
import { UnmappedPanel } from './UnmappedPanel'
import { V2Form } from './V2Form'
import './V2Form.scss'

const LEGEND: { label: string; color: string }[] = [
  { label: 'Migrated', color: '#2cba8f' },
  { label: 'Needs review', color: '#e6a23c' },
  { label: 'Required, empty', color: '#f56c6c' },
  { label: 'New in v2', color: '#1187ee' },
]

/**
 * The "Metadata" card: schema switch (when a legacy record exists), description, the v2 form or the
 * read-only legacy record, and the unmapped-values panel. Slots: `description` (editable description row),
 * `headerActions` (e.g. "Copy from another dataset…", shown in the header before the schema pill). The migration banner lives outside the card
 * (MetadataEditor renders it above).
 */
export const MetadataV2Section = defineComponent({
  name: 'MetadataV2Section',
  props: {
    form: { type: Object as PropType<MetadataV2Form>, required: true },
    /** plain text of the dataset description, shown read-only in the legacy view */
    descriptionText: { type: String, default: '' },
  },
  setup(props, { slots }) {
    // @vue/test-utils wraps props in reactive(), which auto-unwraps nested refs; read the raw form.
    const getForm = () => toRaw(props.form)
    const card = ref<{ expand: () => void } | null>(null)

    // a focus request (legacy-view jump, server error) into a collapsed card opens it first; V2Form mounts
    // with the body and its immediate watcher then handles the request
    watch(
      () => getForm().focusRequest.value,
      (req) => {
        if (req) card.value?.expand()
      },
      { flush: 'sync' }
    )

    const copiedTargets = () => {
      const out: Partial<Record<string, FieldKey>> = {}
      ;(Object.entries(getForm().fields.value) as [FieldKey, FieldReport | undefined][]).forEach(([key, report]) => {
        if (report?.state === 'copied' && report.source?.legacyKey) {
          out[report.source.legacyKey] = key
        }
      })
      return out
    }

    return () => {
      const form = getForm()
      const s = form.status.value
      const isLegacy = form.mode.value === 'legacy'
      const legacyView = form.view.value === 'legacy' && form.legacy.value != null
      const legacy = form.legacy.value
      const datasetId = form.datasetId.value || 'dataset'

      const headerRight = () => [
        slots.headerActions && (
          // rendered outside the collapse toggle; stop clicks anyway so popovers never reach the header
          <span key="actions" class="v2-header-actions" onClick={(e: MouseEvent) => e.stopPropagation()}>
            {slots.headerActions()}
          </span>
        ),
        legacyView && legacy ? (
          <span class="flex gap-2" key="legacy-actions">
            <ElButton size="small" class="v2-export" onClick={() => exportLegacyJson(legacy, datasetId)}>
              ⤓ Export JSON
            </ElButton>
            <ElButton size="small" class="v2-copy-all" onClick={() => copyLegacyJson(legacy)}>
              ⧉ Copy all
            </ElButton>
          </span>
        ) : isLegacy ? (
          <span class="v2-legend" key="legend">
            {LEGEND.map((item) => (
              <span key={item.label}>
                <i class="v2-legend__dot" style={{ background: item.color }} aria-hidden="true" />
                {item.label}
              </span>
            ))}
          </span>
        ) : (
          <ElTag key="pill" size="small" type="info" round>
            Schema v2
          </ElTag>
        ),
        !legacyView && <RequiredCounter key="counter" filled={s.requiredFilled} total={s.requiredTotal} bar />,
      ]

      return (
        <SectionCard
          ref={card}
          class="v2-card"
          title="Metadata"
          subtitle={legacyView ? undefined : 'sample and acquisition'}
          variant={legacyView ? 'legacy' : 'default'}
          v-slots={{
            afterTitle: () =>
              legacyView && (
                <ElTag
                  type="info"
                  effect="dark"
                  size="small"
                  round
                  class="v2-legacy-tag"
                  style="background: #4f6b84; border-color: #4f6b84; color: #fff"
                >
                  LEGACY · READ-ONLY
                </ElTag>
              ),
            headerRight,
            default: () => [
              form.hasLegacyRecord.value && (
                <SchemaSwitch
                  key="switch"
                  modelValue={form.view.value}
                  legacyNote={legacyProvenance(form.legacyMeta.value.uploadDT, form.legacyMeta.value.submitterName)}
                  onUpdate:modelValue={(v: 'v2' | 'legacy') => (form.view.value = v)}
                />
              ),
              !legacyView && slots.description && (
                <SectionRow
                  key="description"
                  class="v2-description"
                  title="Description"
                  help="Optional free-text summary"
                >
                  {slots.description()}
                </SectionRow>
              ),
              legacyView && legacy ? (
                <LegacyRecordView
                  key="legacy"
                  legacy={legacy}
                  fields={form.fields.value}
                  unmapped={form.unmapped.value.filter(
                    (u) => !form.copied.value.includes(u.legacyKey) && !form.dismissed.value.includes(u.legacyKey)
                  )}
                  readOnlyProvenance={!isLegacy}
                  descriptionText={props.descriptionText}
                  onJump={(key: FieldKey) => form.requestFocus(key)}
                  onCopy={(legacyKey: string) => {
                    const row = form.unmapped.value.find((u) => u.legacyKey === legacyKey)
                    if (row) form.requestFocus(row.targets[0], row.raw)
                  }}
                  onSearch={(raw: string) => form.requestFocus('instrument_model', raw)}
                />
              ) : (
                <V2Form key="v2" form={form} />
              ),
              isLegacy && form.unmapped.value.length > 0 && !legacyView && (
                <UnmappedPanel
                  key="unmapped"
                  rows={form.unmapped.value}
                  copied={form.copied.value}
                  dismissed={form.dismissed.value}
                  copiedTargets={copiedTargets()}
                  onCopy={(legacyKey: string, target: FieldKey) => form.copyUnmapped(legacyKey, target)}
                  onDismiss={(legacyKey: string) => form.dismiss(legacyKey)}
                  onRestore={(legacyKey: string) => form.restoreUnmapped(legacyKey)}
                  onUndo={(target: FieldKey) => form.undoCopy(target)}
                />
              ),
            ],
          }}
        />
      )
    }
  },
})
