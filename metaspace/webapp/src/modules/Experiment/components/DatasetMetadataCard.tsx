import { defineComponent, PropType, computed, ref } from 'vue'
import {
  ElCard,
  ElSelect,
  ElOption,
  ElInput,
  ElTable,
  ElTableColumn,
  ElButton,
  ElCheckbox,
} from '../../../lib/element-plus'
import { generateRegionKey, regionLabel as sharedRegionLabel, paletteColor } from '../api'
import type { ExperimentDraftDataset, ExperimentDraftRegion } from '../api'
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
  },
  emits: ['update:modelValue', 'remove'],
  setup(props, { emit }) {
    const shownIonImage = ref(true)

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

    const onRegionSourceChange = (regionSource: ExperimentDraftDataset['regionSource']): void => {
      let regions: ExperimentDraftRegion[]
      const datasetId = props.modelValue.datasetId
      if (regionSource === 'WHOLE') {
        regions = [
          {
            regionKey: generateRegionKey(datasetId, { sourceKind: 'whole' }),
            sourceKind: 'whole',
            roiId: null,
            segmentationId: null,
            labelGroupName: null,
            included: true,
            metadata: emptyMetadata(),
          },
        ]
      } else if (regionSource === 'ROI') {
        regions = props.rois.map((roi) => ({
          regionKey: generateRegionKey(datasetId, { sourceKind: 'roi', roiId: Number(roi.id) }),
          sourceKind: 'roi',
          roiId: Number(roi.id),
          segmentationId: null,
          labelGroupName: null,
          included: true,
          metadata: emptyMetadata(),
        }))
      } else {
        regions = props.segmentations
          .filter((seg) => !seg.stale)
          .map((seg) => ({
            regionKey: generateRegionKey(datasetId, {
              sourceKind: 'segmentation_cluster',
              segmentationId: seg.id,
            }),
            sourceKind: 'segmentation_cluster',
            roiId: null,
            segmentationId: seg.id,
            labelGroupName: null,
            included: true,
            metadata: emptyMetadata(),
          }))
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

    return () => {
      const ds = props.dataset
      const v = props.modelValue
      return (
        <ElCard class="mb-4" data-test-key={`dataset-card-${ds.id}`}>
          {{
            header: () => (
              <div class="flex justify-between items-center">
                <div>
                  <strong>{ds.name}</strong>
                  <span class="text-xs text-gray-500 ml-2">{ds.polarity ?? ''}</span>
                </div>
                <button
                  class="text-red-500 text-sm"
                  data-test-key={`remove-dataset-${ds.id}`}
                  onClick={() => emit('remove')}
                >
                  Remove
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
                  <ElButton
                    size="small"
                    data-test-key={`toggle-ion-image-${ds.id}`}
                    onClick={() => {
                      shownIonImage.value = !shownIonImage.value
                    }}
                  >
                    {shownIonImage.value ? 'Hide ion image' : 'Show ion image'}
                  </ElButton>
                </div>
                <div class="flex gap-3 items-start">
                  <div class="flex-1 min-w-0">
                    <DatasetIonImagePreview
                      shown={shownIonImage.value}
                      ionImageUrl={props.ionImageUrl}
                      opticalImageUrl={props.opticalImageUrl}
                      imageWidth={props.imageWidth}
                      imageHeight={props.imageHeight}
                      overlays={overlays.value}
                    />
                  </div>
                  {shownIonImage.value && overlays.value.length > 0 && (
                    <div
                      class="flex flex-col gap-1 text-sm py-2 min-w-[140px]"
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
                <ElTable data={v.regions} size="small" data-test-key={`region-table-${ds.id}`}>
                  <ElTableColumn label="Region" width="180">
                    {{
                      default: ({ row }: { row: ExperimentDraftRegion }) => regionLabel(row),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="Condition">
                    {{
                      default: ({ row, $index }: { row: ExperimentDraftRegion; $index: number }) => (
                        <ElInput
                          modelValue={row.metadata.condition}
                          onUpdate:modelValue={(val: string) => updateMetadata($index, { condition: val })}
                        />
                      ),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="Bio rep">
                    {{
                      default: ({ row, $index }: { row: ExperimentDraftRegion; $index: number }) => (
                        <ElInput
                          modelValue={row.metadata.biologicalReplicateId}
                          onUpdate:modelValue={(val: string) => updateMetadata($index, { biologicalReplicateId: val })}
                        />
                      ),
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
                      default: ({ row, $index }: { row: ExperimentDraftRegion; $index: number }) => (
                        <ElInput
                          modelValue={row.metadata.technicalReplicateId ?? ''}
                          onUpdate:modelValue={(val: string) =>
                            updateMetadata($index, { technicalReplicateId: val || null })
                          }
                        />
                      ),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="Batch">
                    {{
                      default: ({ row, $index }: { row: ExperimentDraftRegion; $index: number }) => (
                        <ElInput
                          modelValue={row.metadata.batchId ?? ''}
                          onUpdate:modelValue={(val: string) => updateMetadata($index, { batchId: val || null })}
                        />
                      ),
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
