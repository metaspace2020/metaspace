import * as _ from 'lodash';
import fetch from 'node-fetch';
import logger from '../../../utils/logger';
import {FieldResolversFor} from '../../../bindingTypes';
import {Annotation, ColocalizationCoeffFilter} from '../../../binding';
import {ESAnnotation} from '../../../../esConnector';
import config from '../../../utils/config';
import {ESAnnotationWithColoc} from '../queryFilters';
import {AllHtmlEntities} from 'html-entities';

const cleanMoleculeName = (name: string) =>
  // Decode &alpha; &beta; &gamma; etc.
  (new AllHtmlEntities).decode(name)
    // Remove trailing whitespace
    .trim()
    // Clean up molecule names that end in ',' or ';'
    .replace(/[,;]*$/, '');

const Annotation: FieldResolversFor<Annotation, ESAnnotation | ESAnnotationWithColoc> = {
  id(hit) {
    return hit._id;
  },

  sumFormula(hit) {
    return hit._source.formula;
  },

  countPossibleCompounds(hit, args: {includeIsomers: boolean}) {
    if (args.includeIsomers) {
      return hit._source.comps_count_with_isomers || 0;
    } else {
      return hit._source.comp_ids.length;
    }
  },

  possibleCompounds(hit) {
    const ids = hit._source.comp_ids;
    const names = hit._source.comp_names;
    let compounds = [];
    for (let i = 0; i < names.length; i++) {
      let id = ids[i];
      let dbName = hit._source.db_name,
        dbBaseName = dbName.split('-')[0];

      let infoURL: string | null = null;
      if (dbBaseName === 'HMDB') {
        infoURL = `http://www.hmdb.ca/metabolites/${id}`;
      } else if (dbBaseName === 'ChEBI') {
        infoURL = `http://www.ebi.ac.uk/chebi/searchId.do?chebiId=${id}`;
      } else if (dbBaseName === 'SwissLipids') {
        infoURL = `http://swisslipids.org/#/entity/${id}`;
      } else if (dbBaseName === 'LipidMaps' || dbBaseName === 'LIPID_MAPS') {
        infoURL = `http://www.lipidmaps.org/data/LMSDRecord.php?LMID=${id}`;
      } else if (dbBaseName === 'PAMDB') {
        infoURL = `http://pseudomonas.umaryland.edu/PAMDB?MetID=${id}`;
      } else if (dbBaseName === 'ECMDB') {
        infoURL = `http://ecmdb.ca/compounds/${id}`;
      } else if (dbBaseName === 'GNPS') {
        infoURL = `https://gnps.ucsd.edu/ProteoSAFe/gnpslibraryspectrum.jsp?SpectrumID=${id}`;
      } else if (dbBaseName === 'NPA') {
        infoURL = `https://www.npatlas.org/joomla/index.php/explore/compounds#npaid=${id}`;
      }

      compounds.push({
        name: cleanMoleculeName(names[i]),
        imageURL: `/mol-images/${dbBaseName}/${id}.svg`,
        information: [{database: dbName, url: infoURL, databaseId: id}],
      });
    }
    return compounds;
  },

  adduct: (hit) => hit._source.adduct,

  neutralLoss: (hit) => hit._source.neutral_loss || '',

  chemMod: (hit) => hit._source.chem_mod || '',

  ion: (hit) => hit._source.ion,

  ionFormula: (hit) => hit._source.ion_formula || '', // TODO: Remove " || ''" after prod has been migrated

  database: (hit) => hit._source.db_name,

  mz: (hit) => parseFloat(hit._source.centroid_mzs[0] as any),

  fdrLevel: (hit) => hit._source.fdr,

  msmScore: (hit) => hit._source.msm,

  rhoSpatial: (hit) => hit._source.image_corr,

  rhoSpectral: (hit) => hit._source.pattern_match,

  rhoChaos: (hit) => hit._source.chaos,

  offSample: (hit) => hit._source.off_sample_label == null ? null : hit._source.off_sample_label === 'off',

  offSampleProb: (hit) => hit._source.off_sample_prob == null ? null : hit._source.off_sample_prob,

  dataset(hit) {

    return {
      _id: hit._source.ds_id,
      _source: hit._source,
    };
  },

  async peakChartData(hit) {
    const {ion, ds_meta, ds_config, mz, centroid_mzs, total_iso_ints} = hit._source;
    const msInfo = ds_meta.MS_Analysis;
    const host = config.services.sm_engine_api_host;
    const pol = msInfo.Polarity.toLowerCase() == 'positive' ? '+1' : '-1';

    const rp = mz / (ds_config.isotope_generation.isocalc_sigma * 2.35482);
    const ppm = ds_config.image_generation.ppm;
    const ion_without_pol = ion.substr(0, ion.length-1);
    const res = await fetch(`http://${host}/v1/isotopic_patterns/${ion_without_pol}/tof/${rp}/400/${pol}`);
    const {data} = await res.json();

    return JSON.stringify({
      ...data,
      ppm,
      sampleData: {
        mzs: centroid_mzs.filter(_mz => _mz > 0),
        ints: total_iso_ints.filter((_int, i) => centroid_mzs[i] > 0),
      }
    });
  },

  isotopeImages(hit) {
    const {iso_image_ids, centroid_mzs, total_iso_ints, min_iso_ints, max_iso_ints} = hit._source;
    return centroid_mzs
      .map(function(mz, i) {
        return {
          mz: parseFloat(mz as any),
          url: iso_image_ids[i] !== null ? `/${hit._source.ds_ion_img_storage}${config.img_upload.categories.iso_image.path}${iso_image_ids[i]}` : null,
          totalIntensity: total_iso_ints[i],
          minIntensity: min_iso_ints[i],
          maxIntensity: max_iso_ints[i],
        };
      })
      .filter(mzImage => mzImage.mz != null && mzImage.totalIntensity != null && mzImage.minIntensity != null && mzImage.maxIntensity != null);
  },

  isomers(hit) {
    const {isomer_ions} = hit._source;
    return (isomer_ions || []).map(ion => ({ion}))
  },

  isobars(hit) {
    const isobars = hit._source.isobars || [];
    return isobars.map(({ion, ion_formula, peak_ns,  msm}) =>
      ({
        ion,
        ionFormula: ion_formula || '',
        peakNs: peak_ns,
        msmScore: msm,
        shouldWarn: msm > hit._source.msm - 0.5,
      }));
  },

  async colocalizationCoeff(hit, args: {colocalizationCoeffFilter: ColocalizationCoeffFilter | null}, context) {
    // Actual implementation is in src/modules/annotation/queryFilters.ts
    if ('getColocalizationCoeff' in hit && args.colocalizationCoeffFilter != null) {
      const {colocalizedWith, colocalizationAlgo, database, fdrLevel} = args.colocalizationCoeffFilter;
      return await hit.getColocalizationCoeff(colocalizedWith, colocalizationAlgo || config.metadataLookups.defaultColocalizationAlgo,
        database || config.defaults.moldb_names[0], fdrLevel);
    } else {
      return null;
    }
  },
};

export default Annotation;
