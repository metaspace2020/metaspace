import fetch from 'node-fetch'
import { FieldResolversFor } from '../../../bindingTypes'
import { Annotation, ColocalizationCoeffFilter } from '../../../binding'
import { ESAnnotation } from '../../../../esConnector'
import config from '../../../utils/config'
import { ESAnnotationWithColoc } from '../queryFilters'
import { AllHtmlEntities } from 'html-entities'
import { MolecularDB, MolecularDB as MolecularDbModel } from '../../moldb/model'
import { MolecularDbRepository } from '../../moldb/MolecularDbRepository'
import { Context } from '../../../context'

const cleanMoleculeName = (name: string) =>
  // Decode &alpha; &beta; &gamma; etc.
  (new AllHtmlEntities()).decode(name)
    // Remove trailing whitespace
    .trim()
    // Clean up molecule names that end in ',' or ';'
    .replace(/[,;]*$/, '')

const getMolecularDbById = async(ctx: Context, db_id: number): Promise<MolecularDB> => {
  return await ctx.contextCacheGet('getMolecularDbById', [db_id],
    (db_id: number) =>
      ctx.entityManager.getCustomRepository(MolecularDbRepository)
        .findDatabaseById(ctx, db_id)
  )
}

const Annotation: FieldResolversFor<Annotation, ESAnnotation | ESAnnotationWithColoc> = {

  countPossibleCompounds(hit, args: {includeIsomers: boolean}) {
    if (args.includeIsomers) {
      return hit._source.comps_count_with_isomers || 0
    } else {
      return hit._source.comp_ids.length
    }
  },

  async possibleCompounds(hit, _, ctx: Context) {
    const database = await getMolecularDbById(ctx, hit._source.db_id)

    const ids = hit._source.comp_ids
    const names = hit._source.comp_names
    const compounds = []
    for (let i = 0; i < names.length; i++) {
      const id = ids[i]

      const infoURL: string | null = `${database.moleculeLinkTemplate}${id}`
      const dbBaseName = database.name.startsWith('core_metabolome')
        ? 'core_metabolome'
        : database.name.split('-')[0]

      compounds.push({
        name: cleanMoleculeName(names[i]),
        imageURL: `/mol-images/${dbBaseName}/${id}.svg`,
        information: [{ database: database.name, url: infoURL, databaseId: id }],
      })
    }
    return compounds
  },

  databaseDetails: async(hit, _, ctx) => {
    return await getMolecularDbById(ctx, hit._source.db_id)
  },

  database: async(hit, _, ctx) => {
    const database = await getMolecularDbById(ctx, hit._source.db_id)
    return database.name
  },

  dataset(hit) {
    return {
      _id: hit._source.ds_id,
      _source: hit._source,
    }
  },

  async peakChartData(hit) {
    const { ion, ds_meta, ds_config, mz, centroid_mzs, total_iso_ints } = hit._source
    const msInfo = ds_meta.MS_Analysis
    const host = config.services.sm_engine_api_host
    const pol = msInfo.Polarity.toLowerCase() === 'positive' ? '+1' : '-1'

    const rp = mz / (ds_config.isotope_generation.isocalc_sigma * 2.35482)
    const ppm = ds_config.image_generation.ppm
    const ion_without_pol = ion.substr(0, ion.length - 1)
    const res = await fetch(`http://${host}/v1/isotopic_patterns/${ion_without_pol}/tof/${rp}/400/${pol}`)
    const { data } = await res.json()

    return JSON.stringify({
      ...data,
      ppm,
      sampleData: {
        mzs: centroid_mzs.filter(_mz => _mz > 0),
        ints: total_iso_ints.filter((_int, i) => centroid_mzs[i] > 0),
      },
    })
  },

  isotopeImages(hit) {
    const { iso_image_urls, centroid_mzs, total_iso_ints, min_iso_ints, max_iso_ints } = hit._source
    return centroid_mzs
      .map(function(mz, i) {
        return {
          mz: parseFloat(mz as any),
          url: iso_image_urls && iso_image_urls[i] || null,
          totalIntensity: total_iso_ints[i],
          minIntensity: min_iso_ints[i],
          maxIntensity: max_iso_ints[i],
        }
      })
      .filter(mzImage => mzImage.mz != null
        && mzImage.totalIntensity != null
        && mzImage.minIntensity != null
        && mzImage.maxIntensity != null)
  },

  isomers(hit) {
    const { isomer_ions } = hit._source
    return (isomer_ions || []).map(ion => ({ ion }))
  },

  isobars(hit) {
    const isobars = hit._source.isobars || []
    return isobars.map(({ ion, ion_formula, peak_ns, msm }) =>
      ({
        ion,
        ionFormula: ion_formula || '',
        peakNs: peak_ns,
        msmScore: msm,
        shouldWarn: msm > hit._source.msm - 0.5,
      }))
  },

  metricsJson(hit) {
    if (hit._source.metrics != null) {
      return JSON.stringify(hit._source.metrics)
    } else {
      // Remove after migration/reindexing has finished
      return JSON.stringify({
        chaos: hit._source.chaos,
        spatial: hit._source.image_corr,
        spectral: hit._source.pattern_match,
      })
    }
  },

  async colocalizationCoeff(hit, args: {colocalizationCoeffFilter: ColocalizationCoeffFilter | null}, ctx) {
    // Actual implementation is in src/modules/annotation/queryFilters.ts
    if ('getColocalizationCoeff' in hit && args.colocalizationCoeffFilter != null) {
      const { colocalizedWith, colocalizationAlgo, databaseId, fdrLevel } = args.colocalizationCoeffFilter
      const defaultDatabase = await ctx.entityManager.findOneOrFail(
        MolecularDbModel, { default: true }
      )
      return hit.getColocalizationCoeff(
        colocalizedWith,
        colocalizationAlgo || config.metadataLookups.defaultColocalizationAlgo,
        databaseId || defaultDatabase.id,
        fdrLevel || null
      )
    } else {
      return null
    }
  },
}

export default Annotation
