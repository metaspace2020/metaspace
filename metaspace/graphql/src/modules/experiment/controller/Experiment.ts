import { FieldResolversFor } from '../../../bindingTypes'
import { Experiment as ExperimentBinding } from '../../../binding'
import { Experiment as ExperimentEntity } from '../model'

const ExperimentResolvers: FieldResolversFor<ExperimentBinding, ExperimentEntity> = {
  matchMode: (parent) => parent.matchMode.toUpperCase() as any,
  labelGroups: (parent) => parent.labelGroups,
  datasets: (parent) => parent.datasets ?? [],
  run: (parent) => {
    if (!parent.runStatus) return null
    return {
      status: parent.runStatus,
      stage: parent.runStage ?? 'DONE',
      inferredTest: parent.runInferredTest,
      filters: parent.runFilters,
      excludedSamples: parent.runExcludedSamples,
      generation: parent.runGeneration,
      error: parent.runError,
      startedAt: parent.runStartedAt,
      finishedAt: parent.runFinishedAt,
    } as any
  },
}

export default ExperimentResolvers
