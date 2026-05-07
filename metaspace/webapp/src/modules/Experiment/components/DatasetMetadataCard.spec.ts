import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, nextTick } from 'vue'
import DatasetMetadataCard, { RoiOption, SegmentationOption } from './DatasetMetadataCard'
import type { ExperimentDraftDataset } from '../api'
import { ElSelect } from '../../../lib/element-plus'

describe('DatasetMetadataCard', () => {
  const dataset = { id: 'd1', name: 'Mouse 1', polarity: 'POSITIVE' }
  const rois: RoiOption[] = [
    { id: '10', name: 'Tumor' },
    { id: '11', name: 'Liver' },
  ]
  const segmentations: SegmentationOption[] = []

  const defaultDraft: ExperimentDraftDataset = {
    datasetId: 'd1',
    regionSource: 'WHOLE',
    regions: [
      {
        regionKey: 'k0',
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
  }

  it('expands to one region per ROI when region source switches to ROI', async () => {
    const value = ref<ExperimentDraftDataset>(defaultDraft)
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(DatasetMetadataCard, {
            dataset,
            modelValue: value.value,
            rois,
            segmentations,
            labelGroups: [{ name: 'tumor', color: '#ff0000' }],
            'onUpdate:modelValue': (v: ExperimentDraftDataset) => {
              value.value = v
            },
          })
      },
    })
    const wrapper = mount(Wrapper)
    const regionSourceSelect = wrapper.find('[data-test-key="region-source-d1"]')
    expect(regionSourceSelect.exists()).toBe(true)

    // First ElSelect in the tree is the region-source select
    const firstSelect = wrapper.findAllComponents(ElSelect)[0]
    await (firstSelect.vm as any).$emit('change', 'ROI')

    expect(value.value.regionSource).toBe('ROI')
    expect(value.value.regions).toHaveLength(2)
    expect(value.value.regions[0]).toMatchObject({
      sourceKind: 'roi',
      roiId: 10,
      segmentationId: null,
    })
    expect(value.value.regions[1]).toMatchObject({
      sourceKind: 'roi',
      roiId: 11,
    })
  })

  it('does not auto-add stale segmentation clusters to regions', async () => {
    const segs: SegmentationOption[] = [
      { id: 's0', segmentIndex: 0, name: 'Cluster 0', stale: false },
      { id: 's1', segmentIndex: 1, name: 'Cluster 1', stale: true },
    ]
    const value = ref<ExperimentDraftDataset>(defaultDraft)
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(DatasetMetadataCard, {
            dataset,
            modelValue: value.value,
            rois: [],
            segmentations: segs,
            labelGroups: [],
            'onUpdate:modelValue': (v: ExperimentDraftDataset) => {
              value.value = v
            },
          })
      },
    })
    const wrapper = mount(Wrapper)
    const firstSelect = wrapper.findAllComponents(ElSelect)[0]
    await (firstSelect.vm as any).$emit('change', 'SEGMENTATION')

    expect(value.value.regionSource).toBe('SEGMENTATION')
    expect(value.value.regions).toHaveLength(1)
    expect(value.value.regions.map((r) => r.segmentationId)).toEqual(['s0'])
  })

  it('toggling the legend checkbox flips region.included and emits update', async () => {
    const draft: ExperimentDraftDataset = {
      datasetId: 'd1',
      regionSource: 'ROI',
      regions: [
        {
          regionKey: 'r1',
          sourceKind: 'roi',
          roiId: 10,
          segmentationId: null,
          labelGroupName: null,
          included: true,
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
    const value = ref<ExperimentDraftDataset>(draft)
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(DatasetMetadataCard, {
            dataset,
            modelValue: value.value,
            rois,
            segmentations,
            labelGroups: [],
            ionImageUrl: '/tic.png',
            'onUpdate:modelValue': (v: ExperimentDraftDataset) => {
              value.value = v
            },
          })
      },
    })
    const wrapper = mount(Wrapper)
    const toggle = wrapper.findComponent('[data-test-key="overlay-toggle-r1"]') as any
    expect(toggle.exists()).toBe(true)
    toggle.vm.$emit('change', false)
    expect(value.value.regions[0].included).toBe(false)
  })

  it('toggles ion image preview visibility via the toggle button', async () => {
    const value = ref<ExperimentDraftDataset>(defaultDraft)
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(DatasetMetadataCard, {
            dataset,
            modelValue: value.value,
            rois,
            segmentations,
            labelGroups: [],
            ionImageUrl: '/tic.png',
            opticalImageUrl: null,
            'onUpdate:modelValue': (v: ExperimentDraftDataset) => {
              value.value = v
            },
          })
      },
    })
    const wrapper = mount(Wrapper)
    expect(wrapper.find('[data-test-key="ion-image-tic"]').exists()).toBe(true)
    const previewWrapper = wrapper.find('[data-test-key="ion-preview-wrapper-d1"]')
    expect(previewWrapper.classes()).toContain('grid-rows-[1fr]')
    await wrapper.find('[data-test-key="toggle-ion-image-d1"]').trigger('click')
    await nextTick()
    // The preview stays mounted (so the image is preserved between toggles); only
    // the wrapper's grid-rows class flips, driving a CSS drawer transition.
    expect(previewWrapper.classes()).toContain('grid-rows-[0fr]')
    expect(wrapper.find('[data-test-key="ion-image-tic"]').exists()).toBe(true)
  })
})
