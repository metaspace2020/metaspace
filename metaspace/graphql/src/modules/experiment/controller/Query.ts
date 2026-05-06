import { In } from 'typeorm'
import fetch from 'node-fetch'
import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { Context } from '../../../context'
import { Experiment, ExperimentResult } from '../model'
import { Ion } from '../../annotation/model'
import { Annotation } from '../../engine/model'
import { assertCanAccessProject } from '../operation/permissions'
import config from '../../../utils/config'
import logger from '../../../utils/logger'

interface ResultsFilter {
  databases?: number[] | null
  adducts?: string[] | null
  fdrMax?: number | null
  minDetectionRate?: number | null
  labelGroupName?: string | null
}

// Rows with `fdr=null` (the upstream branch skipped correction) are kept as-is.
function applyBenjaminiHochberg<T extends { pValue: number | null; fdr: number | null }>(rows: T[]): T[] {
  const correctable = rows.filter((r) => r.pValue != null) as (T & { pValue: number })[]
  correctable.sort((a, b) => a.pValue - b.pValue)
  const n = correctable.length
  let prev = 1
  for (let i = n - 1; i >= 0; i -= 1) {
    const adj = Math.min(prev, (correctable[i].pValue * n) / (i + 1))
    correctable[i].fdr = adj
    prev = adj
  }
  return rows
}

const QueryResolvers: FieldResolversFor<Query, any> = {
  experiment: async(_, args, ctx: Context) => {
    const id: string = args.id
    const exp = await ctx.entityManager.getRepository(Experiment).findOne({
      where: { id }, relations: ['datasets', 'datasets.dataset', 'createdBy', 'project'],
    })
    if (!exp) return null
    await assertCanAccessProject(ctx, exp.projectId, { write: false })
    return exp as any
  },
  experimentsByProject: async(_, args, ctx: Context) => {
    const projectId: string = args.projectId
    await assertCanAccessProject(ctx, projectId, { write: false })
    return ctx.entityManager.getRepository(Experiment).find({
      where: { projectId },
      relations: ['datasets', 'datasets.dataset', 'createdBy', 'project'],
      order: { createdAt: 'DESC' },
    }) as any
  },
  experimentRunQc: async(_, args, ctx: Context) => {
    const id: string = args.experimentId
    const exp = await ctx.entityManager.getRepository(Experiment).findOneOrFail(id)
    await assertCanAccessProject(ctx, exp.projectId, { write: false })
    return exp.runQc ?? null
  },
  experimentResults: async(_, args, ctx: Context) => {
    const id: string = args.experimentId
    const filter: ResultsFilter = (args.filter as ResultsFilter | null) ?? {}
    const orderBy: string = args.orderBy ?? 'fdr'
    const limit: number = args.limit ?? 100
    const offset: number = args.offset ?? 0

    const exp = await ctx.entityManager.getRepository(Experiment).findOneOrFail(id)
    await assertCanAccessProject(ctx, exp.projectId, { write: false })

    // BH must run over the full filtered set before pagination, so we pull all
    // matching rows up front (bounded ≤ 500K per spec).
    const qb = ctx.entityManager.getRepository(ExperimentResult)
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.ion', 'ion')
      .where('r.experiment_id = :id AND r.run_generation = :gen', {
        id, gen: exp.runGeneration,
      })
    if (filter.labelGroupName) {
      qb.andWhere('r.label_group_name = :lg', { lg: filter.labelGroupName })
    }
    if (filter.minDetectionRate != null) {
      qb.andWhere('GREATEST(r.detection_rate_a, r.detection_rate_b) >= :mdr',
        { mdr: filter.minDetectionRate })
    }

    let rows = await qb.getMany()

    const adducts = filter.adducts ?? []
    const databases = filter.databases ?? []
    if (adducts.length || databases.length) {
      const ionQb = ctx.entityManager.getRepository(Annotation)
        .createQueryBuilder('a').select('DISTINCT a.ion_id', 'ion_id')
      if (databases.length) {
        ionQb.innerJoin('a.job', 'j').andWhere('j.moldb_id IN (:...dbs)', { dbs: databases })
      }
      const allowedIons = new Set<number>(
        (await ionQb.getRawMany()).map(r => Number(r.ion_id))
      )
      rows = rows.filter(r => allowedIons.has(r.ionId))
      if (adducts.length) {
        const ionRows = await ctx.entityManager.getRepository(Ion).find({
          where: { adduct: In(adducts) },
        })
        const adductIds = new Set(ionRows.map(i => i.id))
        rows = rows.filter(r => adductIds.has(r.ionId))
      }
    }

    rows = applyBenjaminiHochberg(rows)
    if (filter.fdrMax != null) {
      const cap = filter.fdrMax
      rows = rows.filter(r => r.fdr != null && r.fdr <= cap)
    }

    rows.sort((a, b) => {
      if (orderBy === 'pValue') {
        if (a.pValue == null && b.pValue == null) return 0
        if (a.pValue == null) return 1
        if (b.pValue == null) return -1
        return a.pValue - b.pValue
      }
      if (orderBy === 'lfc') return Math.abs(b.lfc) - Math.abs(a.lfc)
      return (a.fdr ?? Infinity) - (b.fdr ?? Infinity)
    })

    return rows.slice(offset, offset + limit) as any
  },
  experimentIonIntensities: async(_, args, ctx: Context) => {
    const experimentId: string = args.experimentId
    const ionId: number = args.ionId
    const exp = await ctx.entityManager.getRepository(Experiment).findOne({ where: { id: experimentId } })
    if (!exp) return []
    await assertCanAccessProject(ctx, exp.projectId, { write: false })

    const apiUrl = config.manager_api_url
    if (!apiUrl) {
      logger.error('manager_api_url is not configured')
      throw new Error('Engine API URL is not configured')
    }
    const url = `${apiUrl}/v1/experiment/${experimentId}/ion/${ionId}/intensities`
    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 404) return []
      const errText = res.text ? await res.text() : ''
      logger.error(`experimentIonIntensities: engine returned HTTP ${res.status}: ${errText}`)
      throw new Error(`Engine returned HTTP ${res.status}`)
    }
    const body = await res.json() as { rows?: any[] }
    return (body.rows ?? []).map((r: any) => ({
      regionKey: r.regionKey ?? r.region_key,
      intensity: r.intensity,
      condition: r.condition ?? null,
      sampleId: r.sampleId ?? r.sample_id ?? null,
      biologicalReplicateId: r.biologicalReplicateId ?? r.biological_replicate_id ?? null,
    })) as any
  },
}

export default QueryResolvers
