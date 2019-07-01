import config from './src/utils/config';
import logger from './src/utils/logger';
import {
  esSearchResults,
  esAnnotationByID,
  esFilterValueCountResults,
  esCountResults,
} from './esConnector';
import {fetchMolecularDatabases, deprecatedMolDBs} from './src/utils/molDb';
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
        for (let molDB of molDBs) {
          molDB.default = config.defaults.moldb_names.includes(molDB.name);
          molDB.deprecated = deprecatedMolDBs.has(molDB.name);
          molDB.superseded = molDBs.some(db => db.name === molDB.name && db.version > molDB.version);
          molDB.hidden = molDB.deprecated || molDB.superseded;
        }
        if (hideDeprecated) {
          molDBs = molDBs.filter(molDB => !molDB.deprecated);
        }
        if (onlyLastVersion) {
          molDBs = molDBs.filter(molDB => !molDB.superseded);
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

};

module.exports = Resolvers;
