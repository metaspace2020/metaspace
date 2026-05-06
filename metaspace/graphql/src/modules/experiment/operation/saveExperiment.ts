import { EntityManager } from 'typeorm'
import { UserError } from 'graphql-errors'
import { Context } from '../../../context'
import { esDatasetByID } from '../../../../esConnector'
import {
  Experiment, ExperimentDataset,
  ExperimentLabelGroupSpec, ExperimentRegionSpec,
} from '../model'

interface RegionInput {
  regionKey: string
  sourceKind: string
  roiId: number | null
  segmentationId: string | null
  labelGroupName: string | null
  metadata: ExperimentRegionSpec['metadata']
}

interface DatasetInput {
  datasetId: string
  regionSource: string
  regions: RegionInput[]
}

export interface ExperimentInput {
  name: string
  description: string | null
  matchMode: 'NAME' | 'MANUAL'
  datasets: DatasetInput[]
  labelGroups: { name: string; color: string }[]
}

async function validatePolarity(ctx: Context, datasetIds: string[]) {
  const polarities = new Set<string>()
  for (const id of datasetIds) {
    const ds = await esDatasetByID(id, ctx.user)
    if (!ds) throw new UserError(`Dataset ${id} not found or access denied`)
    const pol = (ds._source as any).ds_polarity
    if (pol) polarities.add(String(pol).toUpperCase())
  }
  if (polarities.size > 1) {
    throw new UserError('All datasets in an experiment must share the same polarity')
  }
}

export async function persistExperiment(
  em: EntityManager,
  ctx: Context,
  projectId: string,
  input: ExperimentInput,
  existingId?: string
): Promise<string> {
  await validatePolarity(ctx, input.datasets.map(d => d.datasetId))

  const labelGroups: ExperimentLabelGroupSpec[] = input.labelGroups.map(lg => ({
    name: lg.name, color: lg.color,
  }))
  const matchMode = input.matchMode.toLowerCase() as 'name' | 'manual'

  const expRepo = em.getRepository(Experiment)
  let expId = existingId
  if (expId) {
    await em.delete(ExperimentDataset, { experimentId: expId })
    await expRepo.update(expId, {
      name: input.name, description: input.description, matchMode, labelGroups,
    })
  } else {
    const created = await expRepo.save(expRepo.create({
      projectId,
      createdById: ctx.user.id!,
      name: input.name,
      description: input.description,
      matchMode,
      labelGroups,
    }))
    expId = created.id
  }

  for (const d of input.datasets) {
    await em.save(ExperimentDataset, em.create(ExperimentDataset, {
      experimentId: expId,
      datasetId: d.datasetId,
      regionSource: d.regionSource.toLowerCase() as 'roi' | 'segmentation' | 'whole',
      regions: d.regions.map(r => ({
        ...r,
        sourceKind: r.sourceKind as ExperimentRegionSpec['sourceKind'],
      })),
    }))
  }
  return expId
}
