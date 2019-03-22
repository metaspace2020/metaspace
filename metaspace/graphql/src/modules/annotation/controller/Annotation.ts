import * as _ from '../../../../resolvers';
import fetch from 'node-fetch';
import {logger} from '../../../../utils';
import {FieldResolversFor} from '../../../bindingTypes';
import {Annotation, ColocalizationCoeffFilter} from '../../../binding';
import {ESAnnotation} from '../../../../esConnector';
import config from '../../../utils/config';
import {ESAnnotationWithColoc} from '../queryFilters';

const Annotation: FieldResolversFor<Annotation, ESAnnotation | ESAnnotationWithColoc> = {
  id(hit) {
    return hit._id;
  },

  sumFormula(hit) {
    return hit._source.sf;
  },

  possibleCompounds(hit) {
    const ids = hit._source.comp_ids;
    const names = hit._source.comp_names;
    let compounds = [];
    for (let i = 0; i < names.length; i++) {
      let id = ids[i];
      let dbName = hit._source.db_name,
        dbBaseName = dbName.split('-')[0];

      let infoURL;
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
      }

      compounds.push({
        name: names[i],
        imageURL: `/mol-images/${dbBaseName}/${id}.svg`,
        information: [{database: dbName, url: infoURL, databaseId: id}],
      });
    }
    return compounds;
  },

  adduct: (hit) => hit._source.adduct,

  ion: (hit) => {
    const polarity = _.get(hit._source.ds_meta, 'MS_Analysis.Polarity');
    const sign = polarity === 'Negative' ? '-' : '+';
    return hit._source.sf_adduct + sign;
  },

  database: (hit) => hit._source.db_name,

  mz: (hit) => parseFloat(hit._source.centroid_mzs[0] as any),

  fdrLevel: (hit) => hit._source.fdr,

  msmScore: (hit) => hit._source.msm,

  rhoSpatial: (hit) => hit._source.image_corr,

  rhoSpectral: (hit) => hit._source.pattern_match,

  rhoChaos: (hit) => hit._source.chaos,

  dataset(hit) {

    return {
      _id: hit._source.ds_id,
      _source: hit._source,
    };
  },

  peakChartData(hit) {
    const {sf_adduct, ds_meta, ds_config, ds_id, mz} = hit._source;
    const msInfo = ds_meta.MS_Analysis;
    const host = config.services.moldb_service_host,
      pol = msInfo.Polarity.toLowerCase() == 'positive' ? '+1' : '-1';

    let rp = mz / (ds_config.isotope_generation.isocalc_sigma * 2.35482),
      ppm = ds_config.image_generation.ppm,
      theorData = fetch(`http://${host}/v1/isotopic_pattern/${sf_adduct}/tof/${rp}/400/${pol}`);

    return theorData.then(res => res.json()).then(json => {
      let {data} = json;
      data.ppm = ppm;
      return JSON.stringify(data);
    }).catch(e => logger.error(e));
  },

  isotopeImages(hit) {
    const {iso_image_ids, centroid_mzs, total_iso_ints, min_iso_ints, max_iso_ints} = hit._source;
    return centroid_mzs.map(function(mz, i) {
      return {
        url: iso_image_ids[i] !== null ? `/${hit._source.ds_ion_img_storage}${config.img_upload.categories.iso_image.path}${iso_image_ids[i]}` : null,
        mz: parseFloat(mz as any),
        totalIntensity: total_iso_ints[i],
        minIntensity: min_iso_ints[i],
        maxIntensity: max_iso_ints[i],
      };
    });
  },

  async colocalizationCoeff(hit, args: {colocalizationCoeffFilter: ColocalizationCoeffFilter | null}, context) {
    // Actual implementation is in src/modules/annotation/queryFilters.ts
    if ('getColocalizationCoeff' in hit && args.colocalizationCoeffFilter != null) {
      const {colocalizedWith, colocalizationAlgo, database, fdrLevel} = args.colocalizationCoeffFilter;
      return await hit.getColocalizationCoeff(colocalizedWith, colocalizationAlgo || 'cosine',
        database || config.defaults.moldb_names[0], fdrLevel);
    } else {
      return null;
    }
  },
};

export default Annotation;
