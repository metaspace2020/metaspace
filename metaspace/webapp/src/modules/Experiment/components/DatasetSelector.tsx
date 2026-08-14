import { defineComponent, PropType } from 'vue'
import { ElSelect, ElOption } from '../../../lib/element-plus'
import { generateRegionKey } from '../api'
import type { ExperimentDraftDataset } from '../api'

/** Candidate dataset shown in the selector dropdown. */
export interface CandidateDataset {
  id: string
  name: string
  polarity: string | null
}

/** Build a default `ExperimentDraftDataset` for a freshly-added dataset. */
export const makeDefaultDraftDataset = (datasetId: string): ExperimentDraftDataset => ({
  datasetId,
  regionSource: 'WHOLE',
  regions: [
    {
      regionKey: generateRegionKey(datasetId, { sourceKind: 'whole' }),
      sourceKind: 'whole',
      roiId: null,
      segmentationId: null,
      labelGroupName: null,
      included: true,
      metadata: {
        condition: '',
        biologicalReplicateId: '',
        sampleId: '',
        technicalReplicateId: null,
        batchId: null,
      },
    },
  ],
})

export default defineComponent({
  name: 'DatasetSelector',
  props: {
    candidates: {
      type: Array as PropType<CandidateDataset[]>,
      required: true,
    },
    modelValue: {
      type: Array as PropType<ExperimentDraftDataset[]>,
      required: true,
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const onChange = (newIds: string[]): void => {
      const existing = new Map(props.modelValue.map((d) => [d.datasetId, d]))
      const next: ExperimentDraftDataset[] = newIds.map((id) => existing.get(id) ?? makeDefaultDraftDataset(id))
      emit('update:modelValue', next)
    }

    return () => {
      const value = props.modelValue.map((d) => d.datasetId)
      return (
        <ElSelect
          modelValue={value}
          multiple
          filterable
          placeholder="Select datasets"
          class="w-full"
          data-test-key="dataset-selector"
          onChange={onChange}
        >
          {props.candidates.map((c) => (
            <ElOption key={c.id} label={c.name} value={c.id} />
          ))}
        </ElSelect>
      )
    }
  },
})
