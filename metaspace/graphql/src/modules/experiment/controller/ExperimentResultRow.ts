import { FieldResolversFor } from '../../../bindingTypes'
import { ExperimentResultRow as ExperimentResultRowBinding } from '../../../binding'
import { Context } from '../../../context'
import { ExperimentDataset } from '../model'
import { Annotation as EngineAnnotation } from '../../engine/model'
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
const ExperimentResultRowResolvers: FieldResolversFor<ExperimentResultRowBinding, any> = {
  annotation: async(parent, _args, ctx: Context) => {
    const ionStr: string | undefined = parent?.ion?.ion
    const ionId: number | null | undefined = parent?.ionId ?? parent?.ion?.id
    const experimentId: string | undefined = parent?.experimentId
    if (!ionStr || ionId == null || !experimentId) return null

    // A missing/failed representative annotation must never break the results
    // table — degrade to null (the cell falls back to a formula-only display).
    try {
      // Best-scoring dataset+database in which this ion was annotated, scoped to
      // the experiment's own datasets (mirrors the scoping used by the database
      // filter in the experimentResults resolver).
      const rep = await ctx.entityManager.getRepository(EngineAnnotation)
        .createQueryBuilder('a')
        .innerJoin('a.job', 'j')
        .select('j.ds_id', 'ds_id')
        .addSelect('j.moldb_id', 'moldb_id')
        .where('a.ion_id = :ionId', { ionId })
        .andWhere(qb => {
          const sub = qb.subQuery()
            .select('ed.dataset_id')
            .from(ExperimentDataset, 'ed')
            .where('ed.experiment_id = :expId')
            .getQuery()
          return 'j.ds_id IN ' + sub
        })
        .setParameter('expId', experimentId)
        .orderBy('a.fdr', 'ASC')
        .addOrderBy('a.msm', 'DESC')
        .limit(1)
        .getRawOne()
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
