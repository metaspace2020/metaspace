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

interface ResultsContrastFilter {
  omnibus?: boolean | null
  condA?: string | null
  condB?: string | null
}

interface ResultsFilter {
  databases?: number[] | null
  adducts?: string[] | null
  fdrMax?: number | null
  minDetectionRate?: number | null
  labelGroupName?: string | null
  contrast?: ResultsContrastFilter | null
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
      // Detection-rate filter only meaningful on pair rows.
      qb.andWhere(
        '(r.cond_a IS NOT NULL AND GREATEST(r.detection_rate_a, r.detection_rate_b) >= :mdr)',
        { mdr: filter.minDetectionRate }
      )
    }

    // Contrast filter — defaults to "pair rows" so K=2 behaves like before.
    const contrast = filter.contrast ?? undefined
    if (contrast?.omnibus) {
      qb.andWhere('r.cond_a IS NULL')
    } else if (contrast?.condA && contrast?.condB) {
      // Canonicalize lex-order so the UI doesn't have to.
      const [ca, cb] = contrast.condA < contrast.condB
        ? [contrast.condA, contrast.condB]
        : [contrast.condB, contrast.condA]
      qb.andWhere('r.cond_a = :ca AND r.cond_b = :cb', { ca, cb })
    } else {
      qb.andWhere('r.cond_a IS NOT NULL')
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

    // orderBy may be a bare column name (legacy) or "<col> ASC|DESC".
    // Direction is honoured for the user-facing sortable columns
    // (pValue, lfc, fdr). Unknown columns fall back to fdr ASC.
    const [orderCol, orderDirRaw] = orderBy.trim().split(/\s+/)
    const orderDir = orderDirRaw?.toUpperCase() === 'DESC' ? -1 : 1
    rows.sort((a, b) => {
      if (orderCol === 'pValue') {
        // Null p-values always sort to the bottom regardless of direction.
        if (a.pValue == null && b.pValue == null) return 0
        if (a.pValue == null) return 1
        if (b.pValue == null) return -1
        return (a.pValue - b.pValue) * orderDir
      }
      if (orderCol === 'lfc') {
        // Signed numeric order so ascending puts the most-negative LFC
        // first (matches what a user expects from a "log fold change"
        // column with a sort arrow). Null LFC (omnibus rows) sort last.
        const la = a.lfc ?? -Infinity
        const lb = b.lfc ?? -Infinity
        return (la - lb) * orderDir
      }
      // Default: fdr ascending puts the most significant rows first.
      const fa = a.fdr ?? Infinity
      const fb = b.fdr ?? Infinity
      return (fa - fb) * orderDir
    })

    return rows.slice(offset, offset + limit) as any
  },
  experimentIonIntensities: async(_, args, ctx: Context) => {
    const experimentId: string = args.experimentId
    const ionId: number = args.ionId
    const exp = await ctx.entityManager.getRepository(Experiment).findOne({ where: { id: experimentId } })
    if (!exp) return []
    await assertCanAccessProject(ctx, exp.projectId, { write: false })

    // Use the engine REST host (same one smApiCall hits, configured per-env in
    // config.services.sm_engine_api_host) rather than manager_api_url, which in
    // dev points at an nginx route that doesn't exist for /v1/experiment.
    const apiHost = config.services?.sm_engine_api_host
    if (!apiHost) {
      logger.error('services.sm_engine_api_host is not configured')
      throw new Error('Engine API host is not configured')
    }
    const url = `http://${apiHost}/v1/experiment/${experimentId}/ion/${ionId}/intensities`
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
