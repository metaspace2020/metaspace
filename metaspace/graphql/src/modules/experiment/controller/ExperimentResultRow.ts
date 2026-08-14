import * as DataLoader from 'dataloader'
import * as _ from 'lodash'
import { FieldResolversFor } from '../../../bindingTypes'
import { ExperimentResultRow as ExperimentResultRowBinding } from '../../../binding'
import { Context } from '../../../context'
import { esAnnotationByIon } from '../../../../esConnector'
import { unpackAnnotation } from '../../annotation/controller/Query'
import logger from '../../../utils/logger'

/**
 * Field resolvers for ExperimentResultRow.
 *
 * The parent value is the `ExperimentResult` entity produced by the
 * `experimentResults` Query resolver (with its `ion` relation eagerly loaded).
 *
 * `annotation` exposes a representative ES-backed Annotation for the row's ion,
 * so the whole Annotation type (possibleCompounds, isomers/isobars, dataset,
 * database, structure images, …) is reused rather than reimplemented. An
 * experiment result aggregates many datasets, so we pick the best-scoring
 * (lowest FDR, then highest MSM) dataset+database in which the ion was
 * annotated within THIS experiment's datasets, and hand its ES document to the
 * Annotation resolvers. Resolved lazily per row, so the unbounded volcano query
 * (which never selects `annotation`) pays nothing.
 */
interface RepAnnotation {
  ion_id: number
  ds_id: string
  moldb_id: number
}

/**
 * Batches the "best-scoring dataset+database for this ion" lookup across all
 * rows of a page. The naive per-row query has no index support on
 * `annotation.ion_id`, so Postgres walks every annotation of every job of the
 * experiment's datasets per call — running it once per row (~100 concurrent
 * queries, each scanning millions of rows on production) saturated the DB and
 * slowed unrelated queries to >10s. One `DISTINCT ON` pass per page keeps the
 * same semantics (lowest FDR, then highest MSM, scoped to the experiment's own
 * datasets) at 1/pageSize of the cost.
 */
const getRepAnnotationDataLoader = (ctx: Context, experimentId: string) => {
  return ctx.contextCacheGet('getRepAnnotationDataLoader', [experimentId],
    (expId: string) => {
      return new DataLoader(async(ionIds: number[]): Promise<(RepAnnotation | null)[]> => {
        const results: RepAnnotation[] = await ctx.entityManager.query(`
          SELECT DISTINCT ON (a.ion_id) a.ion_id, j.ds_id, j.moldb_id
          FROM public.annotation a
          JOIN public.job j ON j.id = a.job_id
          WHERE a.ion_id = ANY($1)
            AND j.ds_id IN (SELECT ed.dataset_id FROM public.experiment_dataset ed
                            WHERE ed.experiment_id = $2)
          ORDER BY a.ion_id, a.fdr ASC, a.msm DESC`,
        [ionIds, expId])
        const keyedResults = _.keyBy(results, 'ion_id')
        return ionIds.map(id => keyedResults[id] || null)
      })
    })
}

const ExperimentResultRowResolvers: FieldResolversFor<ExperimentResultRowBinding, any> = {
  annotation: async(parent, _args, ctx: Context) => {
    const ionStr: string | undefined = parent?.ion?.ion
    const ionId: number | null | undefined = parent?.ionId ?? parent?.ion?.id
    const experimentId: string | undefined = parent?.experimentId
    if (!ionStr || ionId == null || !experimentId) return null

    // A missing/failed representative annotation must never break the results
    // table — degrade to null (the cell falls back to a formula-only display).
    try {
      const rep = await getRepAnnotationDataLoader(ctx, experimentId).load(ionId)
      if (rep == null || rep.ds_id == null || rep.moldb_id == null) return null

      const hit = await esAnnotationByIon(ionStr, String(rep.ds_id), String(rep.moldb_id), ctx.user)
      // Flatten the raw ES hit into the shape the Annotation type resolvers
      // expect (scalar fields like id/ion/sumFormula/fdrLevel are populated
      // here; `_source` is kept for the remaining field resolvers) — same as
      // the annotation/image-viewer-snapshot resolvers.
      return hit == null ? null : unpackAnnotation(hit)
    } catch (e) {
      logger.warn(`ExperimentResultRow.annotation failed for ion ${ionId}: ${e?.stack || e?.message || e}`)
      return null
    }
  },
}

export default ExperimentResultRowResolvers
