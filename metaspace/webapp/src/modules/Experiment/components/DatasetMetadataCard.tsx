import { defineComponent, PropType, computed, ref } from 'vue'
import {
  ElCard,
  ElSelect,
  ElOption,
  ElInput,
  ElTable,
  ElTableColumn,
  ElCheckbox,
  ElButton,
} from '../../../lib/element-plus'
import { View, Close } from '@element-plus/icons-vue'
import { generateRegionKey, regionLabel as sharedRegionLabel, paletteColor } from '../api'
import type { ExperimentDraftDataset, ExperimentDraftRegion } from '../api'
import { datasetSummary, emptyVariables, VARIABLE_LABELS } from '../composables/experimentVariables'
import type { ExperimentVariables, VariableKey } from '../composables/experimentVariables'
import DatasetIonImagePreview, { IonPreviewOverlay } from './DatasetIonImagePreview'

export interface DatasetCardInfo {
  id: string
  name: string
  polarity: string | null
}

export interface RoiOption {
  id: string
  name: string
  geojson?: string | null
}

export interface SegmentationOption {
  id: string
  segmentIndex: number
  name: string | null
  stale: boolean
}

export interface LabelGroupOption {
  name: string
  color: string
}

export interface CopyableSource {
  datasetId: string
  name: string
  roiCount: number
}

const emptyMetadata = (): ExperimentDraftRegion['metadata'] => ({
  condition: '',
  biologicalReplicateId: '',
  sampleId: '',
  technicalReplicateId: null,
  batchId: null,
})

export default defineComponent({
  name: 'DatasetMetadataCard',
  props: {
    dataset: { type: Object as PropType<DatasetCardInfo>, required: true },
    modelValue: { type: Object as PropType<ExperimentDraftDataset>, required: true },
    rois: { type: Array as PropType<RoiOption[]>, default: () => [] },
    segmentations: { type: Array as PropType<SegmentationOption[]>, default: () => [] },
    labelGroups: { type: Array as PropType<LabelGroupOption[]>, default: () => [] },
    ionImageUrl: { type: String as PropType<string | null>, default: null },
    opticalImageUrl: { type: String as PropType<string | null>, default: null },
    imageWidth: { type: Number as PropType<number | null>, default: null },
    imageHeight: { type: Number as PropType<number | null>, default: null },
    segmentationMasks: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
    variables: { type: Object as PropType<ExperimentVariables>, default: () => emptyVariables() },
    copyableSources: { type: Array as PropType<CopyableSource[]>, default: () => [] },
  },
  emits: ['update:modelValue', 'remove', 'copyRoisFrom'],
  setup(props, { emit }) {
    const shownIonImage = ref(false)
    const copySourceId = ref<string | null>(null)

    const update = (patch: Partial<ExperimentDraftDataset>): void => {
      emit('update:modelValue', { ...props.modelValue, ...patch })
    }

    const updateRegion = (idx: number, patch: Partial<ExperimentDraftRegion>): void => {
      const regions = props.modelValue.regions.map((r, i) => (i === idx ? { ...r, ...patch } : r))
      update({ regions })
    }

    const updateMetadata = (idx: number, patch: Partial<ExperimentDraftRegion['metadata']>): void => {
      const region = props.modelValue.regions[idx]
      updateRegion(idx, { metadata: { ...region.metadata, ...patch } })
    }

    /** Build a deterministic default sampleId: "{datasetName}_{regionLabel}".
     *  Uses the existing value if the user has already typed one. */
    const inferSampleId = (
      existingSampleId: string,
      r: { sourceKind: string; roiId?: number | null; segmentationId?: string | null },
      roisArg: typeof props.rois,
      segsArg: typeof props.segmentations
    ): string => {
      if (existingSampleId.trim()) return existingSampleId
      const dsName = props.dataset.name.replace(/\s+/g, '_').slice(0, 40)
      let suffix = ''
      if (r.sourceKind === 'whole') {
        suffix = 'whole'
      } else if (r.sourceKind === 'roi') {
        const roi = roisArg.find((x) => Number(x.id) === r.roiId)
        suffix = roi ? roi.name.replace(/\s+/g, '_') : `roi${r.roiId ?? ''}`
      } else {
        const seg = segsArg.find((s) => s.id === r.segmentationId)
        suffix = seg ? `cluster${seg.segmentIndex}` : 'cluster'
      }
      return `${dsName}_${suffix}`
    }

    const onRegionSourceChange = (regionSource: ExperimentDraftDataset['regionSource']): void => {
      let regions: ExperimentDraftRegion[]
      const datasetId = props.modelValue.datasetId
      // Preserve the global metadata fields from the first existing region so that
      // switching region source (e.g. WHOLE → ROI → WHOLE) never wipes condition/bioRep/etc.
      const preservedMeta = props.modelValue.regions[0]?.metadata ?? emptyMetadata()
      const preserved = {
        metadata: preservedMeta,
        labelGroupName: props.modelValue.regions[0]?.labelGroupName ?? null,
      }
      if (regionSource === 'WHOLE') {
        const r = { sourceKind: 'whole' as const }
        regions = [
          {
            regionKey: generateRegionKey(datasetId, { sourceKind: 'whole' }),
            sourceKind: 'whole',
            roiId: null,
            segmentationId: null,
            labelGroupName: preserved.labelGroupName,
            included: true,
            metadata: {
              ...preserved.metadata,
              sampleId: inferSampleId(preserved.metadata.sampleId, r, props.rois, props.segmentations),
            },
          },
        ]
      } else if (regionSource === 'ROI') {
        regions = props.rois.map((roi) => {
          const r = { sourceKind: 'roi' as const, roiId: Number(roi.id) }
          return {
            regionKey: generateRegionKey(datasetId, { sourceKind: 'roi', roiId: Number(roi.id) }),
            sourceKind: 'roi',
            roiId: Number(roi.id),
            segmentationId: null,
            labelGroupName: preserved.labelGroupName,
            included: true,
            metadata: {
              ...preserved.metadata,
              sampleId: inferSampleId('', r, props.rois, props.segmentations),
            },
          }
        })
      } else {
        regions = props.segmentations
          .filter((seg) => !seg.stale)
          .map((seg) => {
            const r = { sourceKind: 'segmentation_cluster' as const, segmentationId: seg.id }
            return {
              regionKey: generateRegionKey(datasetId, {
                sourceKind: 'segmentation_cluster',
                segmentationId: seg.id,
              }),
              sourceKind: 'segmentation_cluster',
              roiId: null,
              segmentationId: seg.id,
              labelGroupName: preserved.labelGroupName,
              included: true,
              metadata: {
                ...preserved.metadata,
                sampleId: inferSampleId('', r, props.rois, props.segmentations),
              },
            }
          })
      }
      emit('update:modelValue', {
        ...props.modelValue,
        regionSource,
        regions,
      })
    }

    const regionLabel = (r: ExperimentDraftRegion): string => sharedRegionLabel(r, props.rois, props.segmentations)

    const regionColor = (r: ExperimentDraftRegion, idx: number): string => {
      if (r.labelGroupName) {
        const lg = props.labelGroups.find((l) => l.name === r.labelGroupName)
        if (lg) return lg.color
      }
      return paletteColor(idx)
    }

    const overlays = computed<IonPreviewOverlay[]>(() =>
      props.modelValue.regions.map((r, idx) => {
        let geojson: string | null = null
        let maskUrl: string | null = null
        if (r.sourceKind === 'roi' && r.roiId != null) {
          const roi = props.rois.find((x) => Number(x.id) === r.roiId)
          geojson = roi?.geojson ?? null
        } else if (r.sourceKind === 'segmentation_cluster' && r.segmentationId) {
          maskUrl = props.segmentationMasks[r.segmentationId] ?? null
        }
        return {
          id: r.regionKey,
          label: regionLabel(r),
          color: regionColor(r, idx),
          visible: r.included !== false,
          maskUrl,
          geojson,
        }
      })
    )

    const labelGroupOptions = computed(() => [
      { value: '', label: 'None' },
      ...props.labelGroups.map((lg) => ({ value: lg.name, label: lg.name })),
    ])

    const SELECT_TEST_PREFIX: Record<VariableKey, string> = {
      condition: 'condition',
      biologicalReplicateId: 'biorep',
      technicalReplicateId: 'techrep',
      batchId: 'batch',
    }

    /** Compact one-line summary of a dataset's assigned values for the card header. */
    const subtitleText = (v: ExperimentDraftDataset): string => {
      const s = datasetSummary(v)
      const show = (val: string | null): string => (val == null ? '—' : val)
      return [
        show(s.condition),
        show(s.biologicalReplicateId),
        `tech ${show(s.technicalReplicateId)}`,
        `batch ${show(s.batchId)}`,
      ].join(' · ')
    }

    /** Reusable allow-create dropdown for a metadata field. Optional fields are clearable and store '' as null. */
    const metadataSelect = (row: ExperimentDraftRegion, index: number, key: VariableKey, optional: boolean) => (
      <ElSelect
        modelValue={(row.metadata[key] as string | null) ?? ''}
        filterable
        allow-create
        default-first-option
        clearable={optional}
        placeholder={VARIABLE_LABELS[key]}
        data-test-key={`${SELECT_TEST_PREFIX[key]}-select-${props.dataset.id}-${index}`}
        onChange={(val: string) =>
          updateMetadata(index, { [key]: optional ? val || null : val } as Partial<ExperimentDraftRegion['metadata']>)
        }
      >
        {props.variables[key].map((opt) => (
          <ElOption key={opt} value={opt} label={opt} />
        ))}
      </ElSelect>
    )

    return () => {
      const ds = props.dataset
      const v = props.modelValue
      return (
        <ElCard class="mb-4 " shadow="never" data-test-key={`dataset-card-${ds.id}`}>
          {{
            header: () => (
              <div class="flex justify-between items-center gap-4">
                <div>
                  <div>
                    <strong>{ds.name}</strong>
                    <span class="text-xs text-gray-500 ml-2">{ds.polarity ?? ''}</span>
                  </div>
                  <div class="text-xs text-gray-400 mt-1" data-test-key={`dataset-subtitle-${ds.id}`}>
                    {subtitleText(v)}
                  </div>
                </div>
                <button
                  class="bg-transparent border-0 p-0 text-gray-400 
                  hover:text-gray-700 cursor-pointer inline-flex items-center"
                  data-test-key={`remove-dataset-${ds.id}`}
                  aria-label="Remove dataset"
                  onClick={() => emit('remove')}
                >
                  <Close class="w-4 h-4" />
                </button>
              </div>
            ),
            default: () => (
              <div class="space-y-3">
                <div class="flex items-center gap-2">
                  <label class="text-sm w-32">Region source:</label>
                  <ElSelect
                    modelValue={v.regionSource}
                    data-test-key={`region-source-${ds.id}`}
                    onChange={onRegionSourceChange}
                  >
                    <ElOption value="WHOLE" label="Whole dataset" />
                    <ElOption value="ROI" label="ROI" />
                    <ElOption value="SEGMENTATION" label="Segmentation cluster" />
                  </ElSelect>
                  <a
                    class="ml-auto text-blue-600 hover:text-blue-700 text-sm
                     inline-flex items-center gap-1 cursor-pointer select-none"
                    data-test-key={`toggle-ion-image-${ds.id}`}
                    onClick={() => {
                      shownIonImage.value = !shownIonImage.value
                    }}
                  >
                    <span class="underline">Show/hide ion image</span>
                    <View class="w-4 h-4" />
                  </a>
                </div>
                {v.regionSource === 'ROI' && props.copyableSources.length > 0 && (
                  <div class="flex items-center gap-2 flex-wrap" data-test-key={`copy-rois-row-${ds.id}`}>
                    <ElSelect
                      modelValue={copySourceId.value ?? ''}
                      placeholder="Copy ROIs from another dataset…"
                      clearable
                      size="small"
                      style={{ width: '260px' }}
                      data-test-key={`copy-rois-select-${ds.id}`}
                      onChange={(val: string) => {
                        copySourceId.value = val || null
                      }}
                      onClear={() => {
                        copySourceId.value = null
                      }}
                    >
                      {props.copyableSources.map((s) => (
                        <ElOption
                          key={s.datasetId}
                          value={s.datasetId}
                          label={`${s.name} (${s.roiCount} ROI${s.roiCount !== 1 ? 's' : ''})`}
                        />
                      ))}
                    </ElSelect>
                    {copySourceId.value && (
                      <>
                        {props.rois.length > 0 && (
                          <span class="text-xs text-orange-600" data-test-key={`copy-rois-overwrite-warn-${ds.id}`}>
                            Will overwrite {props.rois.length} existing ROI{props.rois.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        <ElButton
                          size="small"
                          type="primary"
                          data-test-key={`copy-rois-confirm-${ds.id}`}
                          onClick={() => {
                            emit('copyRoisFrom', copySourceId.value)
                            copySourceId.value = null
                          }}
                        >
                          Copy
                        </ElButton>
                      </>
                    )}
                    <span class="text-xs text-gray-400">
                      ROIs are copied as-is; ensure datasets share the same pixel dimensions.
                    </span>
                  </div>
                )}
                <div
                  data-test-key={`ion-preview-wrapper-${ds.id}`}
                  class={[
                    'grid transition-[grid-template-rows] duration-500 ease-in-out',
                    shownIonImage.value ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                  ]}
                >
                  <div
                    class={`min-h-0 overflow-hidden bg-gray-100 border-2 border-dashed border-gray-300 rounded p-2 ${
                      shownIonImage.value ? '' : '!border-0 bg-white'
                    }`}
                  >
                    <div class="flex gap-3 items-start">
                      <div class="flex-1 min-w-0">
                        <DatasetIonImagePreview
                          shown={true}
                          ionImageUrl={props.ionImageUrl}
                          opticalImageUrl={props.opticalImageUrl}
                          imageWidth={props.imageWidth}
                          imageHeight={props.imageHeight}
                          overlays={overlays.value}
                          hideIonImage={v.regionSource === 'SEGMENTATION'}
                        />
                      </div>
                      {overlays.value.length > 0 && (
                        <div
                          class="flex flex-col gap-1 text-sm py-2 min-w-[140px] bg-white rounded p-2"
                          data-test-key={`overlay-toggles-${ds.id}`}
                        >
                          {overlays.value.map((o, idx) => (
                            <label key={o.id} class="flex items-center gap-2 cursor-pointer">
                              <ElCheckbox
                                modelValue={o.visible}
                                onChange={(val: boolean) => updateRegion(idx, { included: val })}
                                data-test-key={`overlay-toggle-${o.id}`}
                              />
                              <span
                                class="inline-block w-3 h-3 rounded-sm border border-gray-300"
                                style={{ backgroundColor: o.color }}
                              />
                              <span class="truncate">{o.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <ElTable data={v.regions} size="small" data-test-key={`region-table-${ds.id}`}>
                  <ElTableColumn label="Region" width="180">
                    {{
                      default: ({ row }: { row: ExperimentDraftRegion }) => regionLabel(row),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="Condition">
                    {{
                      default: ({ row, $index }: { row: ExperimentDraftRegion; $index: number }) =>
                        metadataSelect(row, $index, 'condition', false),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="Bio rep">
                    {{
                      default: ({ row, $index }: { row: ExperimentDraftRegion; $index: number }) =>
                        metadataSelect(row, $index, 'biologicalReplicateId', false),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="Sample ID">
                    {{
                      default: ({ row, $index }: { row: ExperimentDraftRegion; $index: number }) => (
                        <ElInput
                          modelValue={row.metadata.sampleId}
                          onUpdate:modelValue={(val: string) => updateMetadata($index, { sampleId: val })}
                        />
                      ),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="Tech rep">
                    {{
                      default: ({ row, $index }: { row: ExperimentDraftRegion; $index: number }) =>
                        metadataSelect(row, $index, 'technicalReplicateId', true),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="Batch">
                    {{
                      default: ({ row, $index }: { row: ExperimentDraftRegion; $index: number }) =>
                        metadataSelect(row, $index, 'batchId', true),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="Label group" width="160">
                    {{
                      default: ({ row, $index }: { row: ExperimentDraftRegion; $index: number }) => (
                        <ElSelect
                          modelValue={row.labelGroupName ?? ''}
                          onChange={(val: string) => updateRegion($index, { labelGroupName: val || null })}
                        >
                          {labelGroupOptions.value.map((opt) => (
                            <ElOption key={opt.value} value={opt.value} label={opt.label} />
                          ))}
                        </ElSelect>
                      ),
                    }}
                  </ElTableColumn>
                </ElTable>
              </div>
            ),
          }}
        </ElCard>
      )
    }
  },
})
