import { applyQueryFilters, ESAnnotationWithColoc } from '../queryFilters'
import {
  esAnnotationByID,
  esCountResults,
  esSearchResults,
  esRawAggregationResults,
  ESAnnotation,
} from '../../../../esConnector'
import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'

export const unpackAnnotation = (hit: ESAnnotation | ESAnnotationWithColoc) => {
  const { _id, _source } = hit

  // Extract all directly accessible fields in one place to reduce the overhead of GraphQL having to call lots of
  // per-field resolvers.
  return {
    ...hit,
    id: _id,
    sumFormula: _source.formula,
    adduct: _source.adduct,
    neutralLoss: _source.neutral_loss || '',
    chemMod: _source.chem_mod || '',
    ion: _source.ion,
    centroidMz: parseFloat(_source.centroid_mzs[0] as any),
    ionFormula: _source.ion_formula,
    mz: _source.mz,
    fdrLevel: _source.fdr > 0 ? _source.fdr : null, // Anns in targeted DBs with MSM==0 have FDR=-1
    msmScore: _source.msm,
    isMono: _source.is_mono,

    rhoSpatial: _source.metrics?.spatial ?? _source.image_corr,
    rhoSpectral: _source.metrics?.spectral ?? _source.pattern_match,
    rhoChaos: _source.metrics?.chaos ?? _source.chaos,

    theoreticalPeakMz: _source.theo_mz,
    theoreticalPeakIntensity: _source.theo_ints,
    observedPeakMz: _source.mz_mean,
    observedPeakMzStddev: _source.mz_stddev,

    offSample: _source.off_sample_label == null ? null : _source.off_sample_label === 'off',
    offSampleProb: _source.off_sample_prob == null ? null : _source.off_sample_prob,
  }
}

const QueryResolvers: FieldResolversFor<Query, void> = {
  async allAnnotations(source, args, ctx) {
    const { postprocess, args: newArgs } = await applyQueryFilters(ctx, args)
    let annotations = await esSearchResults(newArgs, 'annotation', ctx.user)

    if (postprocess != null) {
      annotations = postprocess(annotations)
    }

    return annotations.map(unpackAnnotation)
  },

  async allAggregatedAnnotations(source, args, ctx) {
    const { args: newArgs } = await applyQueryFilters(ctx, args)
    const aggAnnotations = await esRawAggregationResults(newArgs, 'annotation', ctx.user)

    return aggAnnotations.map(agg => ({
      ...agg,
      annotations: agg.annotations.map(unpackAnnotation),
    }))
  },

  async countAnnotations(source, args, ctx) {
    const { args: newArgs } = await applyQueryFilters(ctx, args)

    return await esCountResults(newArgs, 'annotation', ctx.user)
  },

  async annotation(_, { id }, ctx) {
    const ann = await esAnnotationByID(id, ctx.user)
    return ann != null ? unpackAnnotation(ann) : null
  },
}
export default QueryResolvers
