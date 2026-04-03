import { computed, defineComponent, inject, reactive } from 'vue'
import { useStore } from 'vuex'
import { Workflow, WorkflowStep } from '../../../components/Workflow'
import {
  ElSelect,
  ElOption,
  ElButton,
  ElDialog,
  ElRadio,
  ElRadioGroup,
  ElRadioButton,
  ElAlert,
  ElInputNumber,
  ElTooltip,
  ElIcon,
} from '../../../lib/element-plus'
import { ErrorLabelText } from '../../../components/Form'
import { DefaultApolloClient } from '@vue/apollo-composable'

import gql from 'graphql-tag'
import './SegmentationDialog.scss'
import { annotationListQuery } from '@/api/annotation'
import { QuestionFilled } from '@element-plus/icons-vue'

const runSegmentationMutation = gql`
  mutation runSegmentation(
    $datasetId: String!
    $algorithm: String!
    $databaseIds: [Int!]!
    $fdr: Float!
    $adducts: [String!]
    $minMz: Float
    $maxMz: Float
    $offSample: Boolean
    $params: String
  ) {
    runSegmentation(
      datasetId: $datasetId
      algorithm: $algorithm
      databaseIds: $databaseIds
      fdr: $fdr
      adducts: $adducts
      minMz: $minMz
      maxMz: $maxMz
      offSample: $offSample
      params: $params
    )
  }
`

interface SegmentationDialogProps {
  datasetId: string
  datasetName: string
  databases: any[]
  config: any
}

interface SegmentationDialogState {
  workflowStep: number
  // Step 1: Annotation filters
  fdrLevel: number
  minMz: number | null
  maxMz: number | null
  databases: any[]
  adducts: string[]
  offSample: boolean | null
  // Step 2: Algorithm selection
  algorithm: string
  // Step 3: Algorithm parameters
  numSegments: number | null
  applySmoothing: boolean
  // Error states
  firstStepError: boolean
  secondStepError: boolean
  thirdStepError: boolean
  loading: boolean
  annotationCount: number | null
}

const ALGORITHM_OPTIONS = [{ value: 'pca_gmm', label: 'PCA + Gaussian Mixture Model' }]

export const SegmentationDialog = defineComponent({
  name: 'SegmentationDialog',
  props: {
    datasetId: { type: String, required: true },
    datasetName: { type: String, required: true },
    databases: { type: Array, default: () => [] },
    config: { type: Object, default: () => {} },
  },
  emits: ['close'],
  setup(props: SegmentationDialogProps, { emit }) {
    const apolloClient = inject(DefaultApolloClient)
    const store = useStore()
    const state = reactive<SegmentationDialogState>({
      workflowStep: 1,
      fdrLevel: 0.2,
      minMz: null,
      maxMz: null,
      databases: [],
      adducts: [],
      offSample: null,
      algorithm: 'pca_gmm',
      numSegments: null,
      applySmoothing: true,
      firstStepError: false,
      secondStepError: false,
      thirdStepError: false,
      loading: false,
      annotationCount: null,
    })

    const themeVariant = computed(() => store.getters.themeVariant)

    const databaseOptions = computed(() => {
      return (props.databases || []).map((db) => ({
        value: db.id,
        label: `${db.name} - ${db.version}`,
        sourceValue: [db.name, db.version],
      }))
    })

    const adductOptions = computed(() => {
      const adducts = props.config?.isotope_generation?.adducts || []
      return adducts
        .filter((adduct: any) => !adduct.hidden)
        .map((adduct: any) => ({
          value: adduct,
          label: adduct,
        }))
    })

    const validateFirstStep = () => {
      if (state.databases.length === 0 || state.adducts.length === 0) {
        state.firstStepError = true
        return false
      }
      if (state.minMz !== null && state.maxMz !== null && state.minMz >= state.maxMz) {
        state.firstStepError = true
        return false
      }
      state.firstStepError = false
      return true
    }

    const validateSecondStep = () => {
      if (!state.algorithm) {
        state.secondStepError = true
        return false
      }
      state.secondStepError = false
      return true
    }

    const validateThirdStep = () => {
      // K is optional, but if provided, it must be between 2 and 10
      if (state.numSegments !== null && (state.numSegments < 2 || state.numSegments > 10)) {
        state.thirdStepError = true
        return false
      }
      state.thirdStepError = false
      return true
    }

    const handleNext = async () => {
      if (state.workflowStep === 1 && validateFirstStep()) {
        const { data } = await apolloClient.query({
          query: annotationListQuery,
          variables: {
            filter: {
              databaseId: state.databases.length < 2 ? state.databases[0] : undefined,
              adduct: state.adducts.length < 1 ? state.adducts[0] : undefined,
              mzFilter:
                state.minMz || state.maxMz
                  ? {
                      min: state.minMz || 0,
                      max: state.maxMz || Number.MAX_SAFE_INTEGER,
                    }
                  : undefined,
              fdrLevel: state.fdrLevel,
            },
            dFilter: {
              ids: props.datasetId,
            },
          },
        })
        state.annotationCount = data.countAnnotations

        if (state.annotationCount > 50) {
          setTimeout(
            () => {
              state.workflowStep = 2
            },
            state.annotationCount < 100 ? 2000 : 0
          )
        }
      } else if (state.workflowStep === 2 && validateSecondStep()) {
        state.workflowStep = 3
      }
    }

    const handlePrev = () => {
      if (state.workflowStep > 1) {
        state.workflowStep--
      }
    }

    const handleRunSegmentation = async () => {
      if (!validateThirdStep()) {
        return
      }

      try {
        state.loading = true
        const params: any = {
          apply_smoothing: state.applySmoothing,
        }

        // Only include k if it's specified
        if (state.numSegments !== null) {
          params.k = state.numSegments
        }

        await apolloClient.mutate({
          mutation: runSegmentationMutation,
          variables: {
            datasetId: props.datasetId,
            algorithm: state.algorithm,
            databaseIds: state.databases,
            fdr: state.fdrLevel,
            adducts: state.adducts,
            minMz: state.minMz,
            maxMz: state.maxMz,
            offSample: (state.offSample as any) === '' ? null : state.offSample,
            params: JSON.stringify(params),
          },
        })

        emit('close')
        // TODO: Add success notification
        // ElNotification.success('Segmentation job started successfully')
      } catch (error) {
        console.error('Segmentation failed:', error)
        // TODO: Add error notification
        // ElNotification.error('Failed to start segmentation job')
      } finally {
        state.loading = false
      }
    }

    return () => {
      const isLowCoverage = state.annotationCount !== null && state.annotationCount < 50
      const isMediumCoverage =
        state.annotationCount !== null && state.annotationCount >= 50 && state.annotationCount < 100
      return (
        <ElDialog
          model-value={true}
          onClick={(e) => e.stopPropagation()}
          lockScroll={true}
          class="segmentation-dialog sm-content-page el-dialog-lean w-11/12 lg:w-1/2 xl:w-5/12"
          onClose={() => emit('close')}
        >
          <h1>Image segmentation</h1>
          <Workflow>
            {/* Step 1: Select annotation filters */}
            <WorkflowStep
              active={state.workflowStep === 1}
              done={state.workflowStep > 1}
              class={themeVariant.value === 'pro' ? 'pro-theme' : ''}
            >
              <p class="sm-workflow-header">Select the annotations filters</p>
              {state.workflowStep === 1 && (
                <form class="segmentation-step">
                  <div class="filter-grid">
                    <div class="filter-group">
                      <label class="filter-label">FDR threshold</label>
                      <ElRadioGroup
                        modelValue={state.fdrLevel}
                        size="small"
                        onChange={(value: number) => {
                          state.fdrLevel = value
                        }}
                      >
                        <ElRadioButton label={0.05}>5%</ElRadioButton>
                        <ElRadioButton label={0.1}>10%</ElRadioButton>
                        <ElRadioButton label={0.2}>20%</ElRadioButton>
                        <ElRadioButton label={0.5}>50%</ElRadioButton>
                      </ElRadioGroup>
                    </div>

                    <div class="filter-group">
                      <label class="filter-label">m/z range</label>
                      <div class="mz-inputs flex flex-col gap-2">
                        <div class="flex items-center">
                          <div class="input-label mr-1 w-[60px]">Min m/z</div>
                          <ElInputNumber
                            modelValue={state.minMz}
                            placeholder="100.23"
                            onChange={(value: number) => {
                              state.minMz = value
                            }}
                            precision={4}
                            step={0.0001}
                            size="small"
                          />
                        </div>
                        <div class="flex items-center">
                          <div class="input-label mr-1 w-[60px]">Max m/z</div>
                          <ElInputNumber
                            modelValue={state.maxMz}
                            placeholder="100.23"
                            onChange={(value: number) => {
                              state.maxMz = value
                            }}
                            precision={4}
                            step={0.0001}
                            size="small"
                          />
                        </div>
                      </div>
                    </div>

                    <div class="filter-group">
                      <label class="filter-label">Metabolite database</label>
                      <ElSelect
                        class="database-select"
                        modelValue={state.databases}
                        multiple
                        placeholder="Select databases..."
                        onChange={(value: number[]) => {
                          state.databases = value
                        }}
                      >
                        {databaseOptions.value.map((group) => (
                          <ElOption key={group.value} value={group.value} label={group.label} />
                        ))}
                      </ElSelect>
                    </div>

                    <div class="filter-group">
                      <label class="filter-label">Adducts</label>
                      <ElSelect
                        class="adduct-select"
                        modelValue={state.adducts}
                        multiple
                        placeholder="Select adducts..."
                        onChange={(value: string[]) => {
                          state.adducts = value
                        }}
                      >
                        {adductOptions.value.map((option) => (
                          <ElOption key={option.value} value={option.value} label={option.label} />
                        ))}
                      </ElSelect>
                    </div>

                    <div class="filter-group">
                      <label class="filter-label">Sample filter</label>
                      <ElSelect
                        class="sample-filter-select"
                        modelValue={state.offSample}
                        placeholder="Select filter..."
                        clearable
                        onChange={(value: boolean | null) => {
                          state.offSample = value
                        }}
                      >
                        <ElOption value={false} label="On-sample" />
                        <ElOption value={true} label="Off-sample" />
                      </ElSelect>
                    </div>
                  </div>

                  {state.annotationCount !== null && state.annotationCount < 100 && (
                    <ElAlert
                      type={isLowCoverage ? 'error' : 'warning'}
                      show-icon
                      closable={false}
                      class="annotation-warning md:max-w-[450px]"
                    >
                      <div class="annotation-count leading-[22px]">
                        <p class={isMediumCoverage ? '' : 'text-red-700'}>
                          Low annotation coverage. Segmentation may produce coarse or unstable segments. Please{' '}
                          {isMediumCoverage ? 'consider' : 'adjust'} your filters before proceeding.
                        </p>
                        <p class={isMediumCoverage ? '' : 'text-red-700'}>Annotations count: {state.annotationCount}</p>
                      </div>
                    </ElAlert>
                  )}

                  <ErrorLabelText class="mt-2" style={{ visibility: state.firstStepError ? '' : 'hidden' }}>
                    Please select at least one database and one adduct, and ensure min m/z is less than max m/z.
                  </ErrorLabelText>

                  <ElButton onClick={handleNext} type="primary" class="next-btn">
                    Next
                  </ElButton>
                </form>
              )}
            </WorkflowStep>

            {/* Step 2: Select algorithm */}
            <WorkflowStep
              active={state.workflowStep === 2}
              done={state.workflowStep > 2}
              class={themeVariant.value === 'pro' ? 'pro-theme' : ''}
            >
              <p class="sm-workflow-header">Select the segmentation algorithm</p>
              {state.workflowStep === 2 && (
                <form class="segmentation-step">
                  <ElSelect
                    class="algorithm-select"
                    modelValue={state.algorithm}
                    placeholder="Select algorithm"
                    onChange={(value: string) => {
                      state.algorithm = value
                    }}
                  >
                    {ALGORITHM_OPTIONS.map((option) => (
                      <ElOption key={option.value} value={option.value} label={option.label} />
                    ))}
                  </ElSelect>

                  <ErrorLabelText class="mt-2" style={{ visibility: state.secondStepError ? '' : 'hidden' }}>
                    Please select a segmentation algorithm.
                  </ErrorLabelText>

                  <div class="step-buttons">
                    <ElButton onClick={handlePrev}>Prev</ElButton>
                    <ElButton onClick={handleNext} type="primary">
                      Next
                    </ElButton>
                  </div>
                </form>
              )}
            </WorkflowStep>

            {/* Step 3: Set parameters */}
            <WorkflowStep
              active={state.workflowStep === 3}
              done={state.workflowStep > 3}
              class={themeVariant.value === 'pro' ? 'pro-theme' : ''}
            >
              <p class="sm-workflow-header">Select the segmentation parameters</p>
              {state.workflowStep === 3 && (
                <form class="segmentation-step">
                  <div class="parameter-group">
                    <div class="flex items-center">
                      <div class="text-center">K (number of segments):</div>
                      <ElTooltip
                        content="If left empty, we will automatically select the best number of segments"
                        placement="top"
                      >
                        <ElIcon class="help-icon text-lg ml-1 cursor-pointer">
                          <QuestionFilled />
                        </ElIcon>
                      </ElTooltip>
                    </div>
                    <ElInputNumber
                      modelValue={state.numSegments}
                      placeholder="Auto-select"
                      onChange={(value: number | null) => {
                        state.numSegments = value
                      }}
                      precision={0}
                      step={1}
                      clearable
                    />
                  </div>

                  <div class="parameter-group">
                    <label class="parameter-label">Apply spatial denoising:</label>
                    <ElRadioGroup
                      modelValue={state.applySmoothing}
                      onChange={(value: boolean) => {
                        state.applySmoothing = value
                      }}
                    >
                      <ElRadio label={true}>Yes</ElRadio>
                      <ElRadio label={false}>No</ElRadio>
                    </ElRadioGroup>
                  </div>

                  <ErrorLabelText class="mt-2" style={{ visibility: state.thirdStepError ? '' : 'hidden' }}>
                    If specified, number of segments must be between 2 and 10.
                  </ErrorLabelText>

                  <div class="step-buttons">
                    <ElButton onClick={handlePrev}>Prev</ElButton>
                    <ElButton onClick={handleRunSegmentation} type="primary" loading={state.loading}>
                      Run segmentation
                    </ElButton>
                  </div>
                </form>
              )}
            </WorkflowStep>
          </Workflow>
        </ElDialog>
      )
    }
  },
})
