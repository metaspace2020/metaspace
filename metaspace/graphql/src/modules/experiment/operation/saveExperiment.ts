import { EntityManager } from 'typeorm'
import { UserError } from 'graphql-errors'
import { Context } from '../../../context'
import { Segmentation } from '../../engine/model'
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

const storedSegmentationKey = (datasetId: string, segmentationId: string) => `${datasetId}/${segmentationId}`

/**
 * Lists the (dataset, segmentation) pairs an existing experiment already references, so editors other than
 * the creator can keep regions built on the creator's private segmentation.
 */
async function findStoredSegmentations(em: EntityManager, experimentId: string): Promise<Set<string>> {
  const rows = await em.find(ExperimentDataset, { where: { experimentId } })
  const stored = new Set<string>()
  for (const row of rows) {
    for (const r of row.regions || []) {
      if (r.segmentationId) stored.add(storedSegmentationKey(row.datasetId, r.segmentationId))
    }
  }
  return stored
}

/**
 * Ensures every segmentation referenced by a region belongs to the same dataset and to a job the
 * caller may see: the dataset's default job or the caller's own private job. On update, a segmentation the
 * experiment already references on the same dataset stays allowed, whoever edits it.
 *
 * @throws UserError when a new reference is missing, foreign, job-less or private to another user
 */
async function validateSegmentations(
  em: EntityManager, ctx: Context, datasets: DatasetInput[], existingId?: string,
) {
  const ids = new Set<string>()
  for (const ds of datasets) {
    for (const r of ds.regions) {
      if (r.segmentationId) ids.add(r.segmentationId)
    }
  }
  if (ids.size === 0) return

  const stored = existingId ? await findStoredSegmentations(em, existingId) : new Set<string>()

  const rows = await em.getRepository(Segmentation).findByIds(Array.from(ids), { relations: ['job'] })
  const byId = new Map(rows.map(row => [row.id, row]))

  for (const ds of datasets) {
    for (const r of ds.regions) {
      if (!r.segmentationId) continue
      if (stored.has(storedSegmentationKey(ds.datasetId, r.segmentationId))) continue
      const seg = byId.get(r.segmentationId)
      const job = seg && seg.job
      const allowed = !!seg && seg.datasetId === ds.datasetId && !!job
        && (job.isDefault || (ctx.user.id != null && job.userId === ctx.user.id))
      if (!allowed) {
        throw new UserError(`Segmentation ${r.segmentationId} is not available to you on dataset ${ds.datasetId}`)
      }
    }
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
  await validateSegmentations(em, ctx, input.datasets, existingId)

  const usedGroupNames = new Set<string>()
  for (const ds of input.datasets) {
    for (const r of ds.regions) {
      if (r.labelGroupName) usedGroupNames.add(r.labelGroupName)
    }
  }
  const labelGroups: ExperimentLabelGroupSpec[] = input.labelGroups
    .filter(lg => usedGroupNames.has(lg.name))
    .map(lg => ({ name: lg.name, color: lg.color }))
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
