import fetch from 'node-fetch';
import * as config from 'config';
import * as _ from 'lodash';
import {
  esSearchResults,
  esAnnotationByID,
  esFilterValueCountResults,
  esCountResults,
} from './esConnector';
import {
  fetchEngineDS,
  fetchMolecularDatabases,
  deprecatedMolDBs,
  logger,
} from './utils';
import {applyQueryFilters} from './src/modules/annotation/queryFilters';


const Resolvers = {
  Query: {

    async allAnnotations(_, args, ctx) {
      const {postprocess, args: newArgs} = await applyQueryFilters(ctx, args);
      let annotations = await esSearchResults(newArgs, 'annotation', ctx.user);

      if (postprocess != null) {
        annotations = postprocess(annotations);
      }

      return annotations;
    },

    async countAnnotations(_, args, ctx) {
      const {args: newArgs} = await applyQueryFilters(ctx, args);

      return await esCountResults(newArgs, 'annotation', ctx.user);
    },

    async annotation(_, { id }, ctx) {
      return await esAnnotationByID(id, ctx.user);
    },

    async metadataSuggestions(_, {field, query, limit}, ctx) {
      const itemCounts = await esFilterValueCountResults({
        wildcard: { wildcard: { [`ds_meta.${field}`]: `*${query}*` } },
        aggsTerms: {
          terms: {
            field: `ds_meta.${field}.raw`,
            size: limit,
            order: { _count : 'desc' }
          }
        },
        limit
      }, ctx.user);
      return Object.keys(itemCounts);
    },

    adductSuggestions() {
      return config.defaults.adducts['-'].map(a => {
        return {adduct: a, charge: -1};
      }).concat(config.defaults.adducts['+'].map(a => {
        return {adduct: a, charge: 1};
      }));
    },

    async submitterSuggestions(_, {query}, ctx) {
      const itemCounts = await esFilterValueCountResults({
        wildcard: { wildcard: { ds_submitter_name: `*${query}*` } },
        aggsTerms: {
          terms: {
            script: {
              inline: "doc['ds_submitter_id'].value + '/' + doc['ds_submitter_name.raw'].value",
              lang: 'painless'
            },
            size: 1000,
            order: { _term : 'asc' }
          }
        }
      }, ctx.user);
      return Object.keys(itemCounts).map((s) => {
        const [id, name] = s.split('/');
        return { id, name }
      });
    },

    async molecularDatabases(_, args, ctx) {
      try {
        const {hideDeprecated, onlyLastVersion} = args;

        let molDBs = await fetchMolecularDatabases();
        if (hideDeprecated) {
          molDBs = molDBs.filter((molDB) => !deprecatedMolDBs.has(molDB.name));
        }
        for (let molDB of molDBs) {
          molDB['default'] = config.defaults.moldb_names.includes(molDB.name);
        }
        if (onlyLastVersion) {
          const molDBNameMap = new Map();
          for (let molDB of molDBs) {
            if (!molDBNameMap.has(molDB.name))
              molDBNameMap.set(molDB.name, molDB);
            else if (molDB.version > molDBNameMap.get(molDB.name).version)
              molDBNameMap.set(molDB.name, molDB);
          }
          molDBs = Array.from(molDBNameMap.values());
        }

        return molDBs;
      }
      catch (e) {
        logger.error(e);
        return 'Server error';
      }
    },

    async colocalizationAlgos() {
      return config.metadataLookups.colocalizationAlgos
        .map(([id, name]) => ({id, name}));
    },
  },

  Analyzer: {
    resolvingPower(msInfo, { mz }) {
      const rpMz = msInfo.rp.mz,
        rpRp = msInfo.rp.Resolving_Power;
      if (msInfo.type.toUpperCase() == 'ORBITRAP')
        return Math.sqrt(rpMz / mz) * rpRp;
      else if (msInfo.type.toUpperCase() == 'FTICR')
        return (rpMz / mz) * rpRp;
      else
        return rpRp;
    }
  },

  Annotation: {
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
          information: [{database: dbName, url: infoURL, databaseId: id}]
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

    mz: (hit) => parseFloat(hit._source.centroid_mzs[0]),

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
          mz: parseFloat(mz),
          totalIntensity: total_iso_ints[i],
          minIntensity: min_iso_ints[i],
          maxIntensity: max_iso_ints[i]
        }
      });
    },

    async colocalizationCoeff(hit, args, context) {
      // Actual implementation is in src/modules/annotation/queryFilters.ts
      if (hit.getColocalizationCoeff != null && args.colocalizationCoeffFilter != null) {
        const {colocalizedWith, colocalizationAlgo, database, fdrLevel} = args.colocalizationCoeffFilter;
        return await hit.getColocalizationCoeff(colocalizedWith, colocalizationAlgo || 'cosine', database, fdrLevel);
      } else {
        return null;
      }
    },
  },
};

module.exports = Resolvers;
