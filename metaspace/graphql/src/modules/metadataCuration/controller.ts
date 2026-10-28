import { IResolvers } from 'graphql-tools'
import { UserError } from 'graphql-errors'
import { EntityManager } from 'typeorm'
import { FieldResolversFor } from '../../bindingTypes'
import { CurationTerm, Mutation, Query } from '../../binding'
import { Context } from '../../context'
import logger from '../../utils/logger'
import { SLOT_SUBTREES } from '../lookups/controller'
import { getUserSourceById } from '../user/util/getUserSourceById'
import { getDatasetForEditing } from '../dataset/operation/getDatasetForEditing'
import { applyCurationTerm } from './apply'
import { CurationTermStatus, MetadataCurationTerm } from './model'
import { normalizeCurationText } from './normalize'
import { curationSlot } from './slots'
import { curatedValuesFor } from './queue'

/** A row as the `CurationTerm` resolvers see it: the entity plus its dataset's name and upload time. */
type CurationTermSource = MetadataCurationTerm & { datasetName: string | null, submittedAt: Date | null }

interface TermFilter {
  status?: CurationTermStatus | null
  slot?: string | null
  submitterId?: string | null
  query?: string | null
}

const TABLE = 'public.metadata_curation_term'
const RETRY_AFTER_MS = 10 * 60 * 1000
const ORDER_BY: Record<string, string> = {
  TEXT: 't.text ASC, t.id ASC',
  FIRST_SUBMITTED: 't.created_at DESC, t.id DESC',
}

const assertAdmin = (ctx: Context) => {
  if (!ctx.isAdmin) {
    throw new UserError('Not authorized')
  }
}

const assertSlot = (slot: string | null | undefined) => {
  if (slot != null && !curationSlot(slot)) {
    throw new UserError('Unknown field')
  }
}

const clamp = (value: number | null | undefined, min: number, max: number, fallback: number) =>
  Math.min(Math.max(value ?? fallback, min), max)

const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&')

const toIso = (date: Date | null | undefined) => date != null ? new Date(date).toISOString() : null

/** WHERE clause and its bound parameters for the queue filters; `withStatus` false drops the status filter. */
const filterSql = (filter: TermFilter, withStatus: boolean) => {
  const params: any[] = []
  const param = (value: any) => {
    params.push(value)
    return `$${params.length}`
  }
  const clauses: string[] = []
  if (withStatus && filter.status) {
    // the queue has no Mapped tab: Approved lists both free-text approvals and ontology maps
    clauses.push(filter.status === 'approved'
      ? 't.status IN (\'approved\', \'mapped\')'
      : `t.status = ${param(filter.status)}`)
  }
  if (filter.slot) {
    clauses.push(`t.slot = ${param(filter.slot)}`)
  }
  const query = (filter.query || '').trim()
  if (query) {
    const pattern = param(`%${escapeLike(query)}%`)
    clauses.push(`(t.text ILIKE ${pattern} OR t.canonical_label ILIKE ${pattern}
      OR array_to_string(t.aliases, ' ') ILIKE ${pattern})`)
  }
  if (filter.submitterId) {
    clauses.push(`t.submitter_id = ${param(filter.submitterId)}`)
  }
  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

/** The rows of `ids` in that order (missing ids dropped), each with its dataset's name and upload time. */
const loadTerms = async(em: EntityManager, ids: string[]): Promise<CurationTermSource[]> => {
  if (ids.length === 0) {
    return []
  }
  const rows = await em.findByIds(MetadataCurationTerm, ids)
  const byId = new Map(rows.map(row => [row.id, row]))
  const datasets: { id: string, dataset_name: string | null, submitted_at: Date | null }[] = await em.query(
    `SELECT t.id, e.name AS dataset_name, e.upload_dt AS submitted_at FROM ${TABLE} t
    LEFT JOIN public.dataset e ON e.id = t.dataset_id
    WHERE t.id = ANY($1)`,
    [ids]
  )
  const datasetById = new Map(datasets.map(row => [row.id, row]))
  return ids
    .filter(id => byId.has(id))
    .map(id => Object.assign(byId.get(id)!, {
      datasetName: datasetById.get(id)?.dataset_name ?? null,
      submittedAt: datasetById.get(id)?.submitted_at ?? null,
    }))
}

/** The rows of `ids`, failing when any is missing. */
const findRows = async(em: EntityManager, ids: (string | number)[]): Promise<MetadataCurationTerm[]> => {
  const uniqueIds = Array.from(new Set(ids.map(String)))
  const rows = uniqueIds.length > 0 ? await em.findByIds(MetadataCurationTerm, uniqueIds) : []
  if (rows.length !== uniqueIds.length) {
    throw new UserError('Term not found')
  }
  return rows
}

/** True while the row's apply is running and was started less than `RETRY_AFTER_MS` ago. */
const isApplyRunning = (row: MetadataCurationTerm) => row.applyState === 'running'
  && !(row.decidedAt != null && Date.now() - new Date(row.decidedAt).getTime() > RETRY_AFTER_MS)

/** Refuses a decision on a row whose apply is still running, so two applies never overlap. */
const assertNotRunning = (rows: MetadataCurationTerm[]) => {
  const running = rows.find(isApplyRunning)
  if (running) {
    throw new UserError(`An apply is still running for "${running.text}"`)
  }
}

const startApply = (ctx: Context, termId: string) => {
  applyCurationTerm(ctx.entityManager, termId)
    .catch(err => logger.error(`Applying curation term ${termId} failed`, err))
}

const decisionStamp = (ctx: Context, note: string | null | undefined) => ({
  decidedById: ctx.user.id!,
  decidedAt: new Date(),
  note: note ?? null,
})

/** The non-obsolete term `curie` of the slot's subtrees, or undefined. */
const lookupOntologyTerm = async(em: EntityManager, slot: string, curie: string) => {
  const rows: { curie: string, label: string }[] = await em.query(
    `SELECT curie, label FROM "public"."ontology_term"
    WHERE curie = $1 AND subtree = ANY($2) AND obsolete = false LIMIT 1`,
    [curie, SLOT_SUBTREES[slot]]
  )
  return rows[0] as { curie: string, label: string } | undefined
}

const findOntologyTerm = async(em: EntityManager, slot: string, curie: string) => {
  const term = await lookupOntologyTerm(em, slot, curie)
  if (term === undefined) {
    throw new UserError('Unknown term for this field')
  }
  return term
}

const QueryResolvers: FieldResolversFor<Query, void> = {
  async curationTerms(source, args, ctx) {
    assertAdmin(ctx)
    assertSlot(args.slot)
    const filter: TermFilter = {
      status: args.status ? args.status.toLowerCase() as CurationTermStatus : null,
      slot: args.slot,
      submitterId: args.submitterId != null ? String(args.submitterId) : null,
      query: args.query,
    }
    const em = ctx.entityManager
    const { where, params } = filterSql(filter, true)
    const offset = Math.max(args.offset ?? 0, 0)
    const limit = clamp(args.limit, 1, 200, 50)
    const orderBy = ORDER_BY[args.orderBy || 'FIRST_SUBMITTED']
    const idRows: { id: string }[] = await em.query(
      `SELECT t.id FROM ${TABLE} t ${where} ORDER BY ${orderBy}
      OFFSET $${params.length + 1} LIMIT $${params.length + 2}`,
      [...params, offset, limit]
    )
    const [{ total }] = await em.query(`SELECT count(*)::int AS total FROM ${TABLE} t ${where}`, params)
    const counts = filterSql(filter, false)
    const countRows: { status: CurationTermStatus, count: number }[] = await em.query(
      `SELECT t.status, count(*)::int AS count FROM ${TABLE} t ${counts.where} GROUP BY t.status`, counts.params)
    const statusCounts: Record<string, number> = { pending: 0, approved: 0, rejected: 0 }
    countRows.forEach(row => {
      const bucket = row.status === 'mapped' ? 'approved' : row.status
      statusCounts[bucket] += row.count
    })

    return {
      terms: await loadTerms(em, idRows.map(row => row.id)),
      total,
      statusCounts,
    }
  },

  async curationTerm(source, { id }, ctx) {
    assertAdmin(ctx)
    const [term] = await loadTerms(ctx.entityManager, [String(id)])
    return term ?? null
  },

  async approvedCurationValues(source, { slot, query, limit }, ctx) {
    assertSlot(slot)
    const pattern = `%${escapeLike((query || '').trim())}%`
    const rows: { label: string }[] = await ctx.entityManager.query(
      `SELECT DISTINCT t.canonical_label AS label FROM ${TABLE} t
      WHERE t.slot = $1 AND t.status = 'approved' AND t.canonical_label IS NOT NULL
        AND (t.canonical_label ILIKE $2 OR EXISTS (SELECT 1 FROM unnest(t.aliases) alias WHERE alias ILIKE $2))
      ORDER BY label LIMIT $3`,
      [slot, pattern, clamp(limit, 1, 50, 8)]
    )
    return rows.map(row => row.label)
  },

  async datasetCurationStatus(source, { datasetId }, ctx) {
    await getDatasetForEditing(ctx.entityManager, ctx.user, String(datasetId))
    const rows: { slot: string, text: string, status: CurationTermStatus, note: string | null }[] =
      await ctx.entityManager.query(
        `SELECT slot, text, status, note FROM ${TABLE} WHERE dataset_id = $1 ORDER BY slot`,
        [String(datasetId)]
      )
    return rows.map(row => ({ ...row, status: row.status.toUpperCase() }))
  },
}

/**
 * What an unbound row's `label` maps to: a seed value of its slot (seed spelling, no target row), else an approved
 * row of the slot whose canonical label matches case-insensitively (that row is the alias target).
 */
const findUnboundTarget = async(em: EntityManager, row: MetadataCurationTerm, label: string):
  Promise<{ label: string, targetId?: string } | null> => {
  const key = label.trim().toLowerCase()
  const seed = curatedValuesFor(row.slot).find(value => value.toLowerCase() === key)
  if (seed) {
    return { label: seed }
  }
  const [approved]: { id: string, label: string }[] = await em.query(
    `SELECT id, canonical_label AS label FROM ${TABLE}
    WHERE slot = $1 AND status = 'approved' AND id <> $2 AND lower(canonical_label) = $3
    ORDER BY decided_at DESC NULLS LAST LIMIT 1`,
    [row.slot, row.id, key])
  return approved ? { label: approved.label, targetId: String(approved.id) } : null
}

const MutationResolvers: FieldResolversFor<Mutation, void> = {
  async approveCurationTerms(source, { input }, ctx) {
    assertAdmin(ctx)
    const ids = ([] as (string | number)[]).concat(input.ids)
    const applyIds = await ctx.entityManager.transaction(async em => {
      const rows = await findRows(em, ids)
      assertNotRunning(rows)
      const single = rows.length === 1
      const inputAliases = input.aliases != null ? ([] as string[]).concat(input.aliases) : null
      const plans = rows.map(row => ({
        row,
        canonicalLabel: (single && input.canonicalLabel?.trim()) || row.text,
        // bulk approve takes no aliases; a single approve without aliases keeps the row's own. Aliases only
        // feed the auto-resolution of other datasets' text, so they are stored on this row alone.
        aliases: !single || inputAliases == null
          ? row.aliases
          : Array.from(new Set(inputAliases.map(normalizeCurationText)))
            .filter(alias => alias !== '' && alias !== row.normalizedText),
      }))
      for (const { row, canonicalLabel, aliases } of plans) {
        await em.update(MetadataCurationTerm, row.id, {
          status: 'approved',
          canonicalLabel,
          ontologyId: null,
          aliases,
          ...decisionStamp(ctx, input.note),
        })
      }
      return plans.map(plan => plan.row.id)
    })
    applyIds.forEach(id => startApply(ctx, id))
    return { terms: await loadTerms(ctx.entityManager, applyIds), skipped: 0 }
  },

  async mapCurationTerms(source, { input }, ctx) {
    assertAdmin(ctx)
    const ids = ([] as (string | number)[]).concat(input.ids)
    let skipped = 0
    const applyIds = await ctx.entityManager.transaction(async em => {
      const rows = await findRows(em, ids)
      assertNotRunning(rows)
      const plans: { row: MetadataCurationTerm, changes: Partial<MetadataCurationTerm>, target?: string }[] = []
      for (const row of rows) {
        const bound = SLOT_SUBTREES[row.slot] != null
        if (input.useSuggested && !bound) {
          // an unbound suggestion is a seed value or an approved row's label of the slot; anything else is skipped
          const suggested = row.suggestedLabel ? await findUnboundTarget(em, row, row.suggestedLabel) : null
          if (!suggested) {
            skipped++
            continue
          }
          plans.push({
            row,
            changes: { status: 'approved', ontologyId: null, canonicalLabel: suggested.label },
            target: suggested.targetId,
          })
        } else if (input.useSuggested || bound) {
          const curie = input.useSuggested ? row.suggestedOntologyId : input.ontologyId
          if (input.useSuggested && !curie) {
            skipped++
            continue
          }
          if (!curie) {
            throw new UserError('An ontology term is required')
          }
          // a stored suggestion may since have gone obsolete or left the slot's subtrees: skip that row
          const term = input.useSuggested
            ? await lookupOntologyTerm(em, row.slot, curie)
            : await findOntologyTerm(em, row.slot, curie)
          if (term === undefined) {
            skipped++
            continue
          }
          plans.push({ row, changes: { status: 'mapped', ontologyId: term.curie, canonicalLabel: term.label } })
        } else {
          // An unbound slot has no CURIE: the row joins an approved row of the slot as its alias and is
          // accepted as free text under that row's label (a `mapped` row would need an ontology id).
          if (input.targetTermId == null) {
            throw new UserError('This field can only be mapped to an approved term')
          }
          const target = await em.findOne(MetadataCurationTerm, String(input.targetTermId))
          if (!target || target.status !== 'approved' || target.slot !== row.slot || target.id === row.id) {
            throw new UserError('The target must be an approved term of the same field')
          }
          plans.push({
            row,
            changes: { status: 'approved', ontologyId: null, canonicalLabel: target.canonicalLabel ?? target.text },
            target: target.id,
          })
        }
      }

      for (const { row, changes, target } of plans) {
        if (target) {
          await em.query(
            `UPDATE ${TABLE} SET aliases = array_append(aliases, $2) WHERE id = $1 AND NOT ($2 = ANY(aliases))`,
            [target, row.normalizedText])
        }
        await em.update(MetadataCurationTerm, row.id, { ...changes, ...decisionStamp(ctx, input.note) })
      }
      return plans.map(plan => plan.row.id)
    })
    applyIds.forEach(id => startApply(ctx, id))
    return { terms: await loadTerms(ctx.entityManager, applyIds), skipped }
  },

  async rejectCurationTerms(source, { input }, ctx) {
    assertAdmin(ctx)
    const note = (input.note || '').trim()
    if (!note) {
      throw new UserError('A reason is required')
    }
    const ids = ([] as (string | number)[]).concat(input.ids)
    const { rejectedIds, applyIds } = await ctx.entityManager.transaction(async em => {
      const rows = await findRows(em, ids)
      assertNotRunning(rows)
      for (const row of rows) {
        await em.update(MetadataCurationTerm, row.id, { status: 'rejected', ...decisionStamp(ctx, note) })
      }
      return {
        rejectedIds: rows.map(row => row.id),
        // a pending row's dataset carries no decision to revert
        applyIds: rows.filter(row => row.status === 'approved' || row.status === 'mapped').map(row => row.id),
      }
    })
    applyIds.forEach(id => startApply(ctx, id))
    return { terms: await loadTerms(ctx.entityManager, rejectedIds), skipped: 0 }
  },

  async retryCurationApply(source, { id }, ctx) {
    assertAdmin(ctx)
    const [row] = await findRows(ctx.entityManager, [id])
    if (row.applyState !== 'failed' && (row.applyState !== 'running' || isApplyRunning(row))) {
      throw new UserError('This apply cannot be retried')
    }
    // restamped so the staleness clock measures this retry, not the original decision
    await ctx.entityManager.update(MetadataCurationTerm, row.id,
      { applyState: 'running', appliedCount: 0, decidedAt: new Date() })
    startApply(ctx, row.id)
    const [term] = await loadTerms(ctx.entityManager, [row.id])
    return term
  },
}

const CurationTermResolvers: FieldResolversFor<CurationTerm, CurationTermSource> = {
  status: term => term.status.toUpperCase(),
  applyState: term => term.applyState.toUpperCase(),
  createdAt: term => toIso(term.createdAt),
  decidedAt: term => toIso(term.decidedAt),
  submittedAt: term => toIso(term.submittedAt),
  submitter: async(term, args, ctx) =>
    term.submitterId != null ? await getUserSourceById(ctx, term.submitterId) : null,
  decidedBy: async(term, args, ctx) =>
    term.decidedById != null ? await getUserSourceById(ctx, term.decidedById) : null,
}

export const Resolvers = {
  Query: QueryResolvers,
  Mutation: MutationResolvers,
  CurationTerm: CurationTermResolvers,
} as IResolvers<any, Context>
