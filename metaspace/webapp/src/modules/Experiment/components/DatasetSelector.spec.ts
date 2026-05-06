import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import DatasetSelector, { CandidateDataset } from './DatasetSelector'
import type { ExperimentDraftDataset } from '../api'
import { ElSelect } from '../../../lib/element-plus'

describe('DatasetSelector', () => {
  const candidates: CandidateDataset[] = [
    { id: 'd1', name: 'Dataset 1', polarity: 'POSITIVE' },
    { id: 'd2', name: 'Dataset 2', polarity: 'POSITIVE' },
    { id: 'd3', name: 'Dataset 3', polarity: 'NEGATIVE' },
  ]

  const harness = (initial: ExperimentDraftDataset[] = []) => {
    const value = ref<ExperimentDraftDataset[]>(initial)
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(DatasetSelector, {
            candidates,
            modelValue: value.value,
            'onUpdate:modelValue': (v: ExperimentDraftDataset[]) => {
              value.value = v
            },
          })
      },
    })
    const wrapper = mount(Wrapper)
    return { wrapper, value }
  }

  it('emits update:modelValue with default drafts when datasets are selected', async () => {
    const { wrapper, value } = harness([])
    const select = wrapper.findComponent(ElSelect)
    expect(select.exists()).toBe(true)
    // Simulate the underlying ElSelect change event with two ids.
    await (select.vm as any).$emit('change', ['d1', 'd3'])

    expect(value.value).toHaveLength(2)
    expect(value.value[0]).toMatchObject({
      datasetId: 'd1',
      regionSource: 'WHOLE',
      regions: [
        {
          sourceKind: 'whole',
          roiId: null,
          segmentationId: null,
          labelGroupName: null,
        },
      ],
    })
    expect(value.value[1].datasetId).toBe('d3')
    expect(value.value[1].regions[0].metadata).toEqual({
      condition: '',
      biologicalReplicateId: '',
      sampleId: '',
      technicalReplicateId: null,
      batchId: null,
    })
  })

  it('preserves existing draft entries when re-selecting', async () => {
    const existing: ExperimentDraftDataset = {
      datasetId: 'd1',
      regionSource: 'ROI',
      regions: [
        {
          regionKey: 'k-roi-42',
          sourceKind: 'roi',
          roiId: 42,
          segmentationId: null,
          labelGroupName: 'tumor',
          metadata: {
            condition: 'control',
            biologicalReplicateId: 'm1',
            sampleId: 's1',
            technicalReplicateId: null,
            batchId: null,
          },
        },
      ],
    }
    const { wrapper, value } = harness([existing])
    const select = wrapper.findComponent(ElSelect)
    await (select.vm as any).$emit('change', ['d1', 'd2'])

    expect(value.value).toHaveLength(2)
    expect(value.value[0]).toEqual(existing)
    expect(value.value[1].datasetId).toBe('d2')
    expect(value.value[1].regionSource).toBe('WHOLE')
  })
})
