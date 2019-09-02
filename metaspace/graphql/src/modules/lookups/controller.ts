import {FieldResolversFor} from '../../bindingTypes';
import {Query} from '../../binding';
import {esFilterValueCountResults} from '../../../esConnector';
import config from '../../utils/config';
import {deprecatedMolDBs, fetchMolecularDatabases} from '../../utils/molDb';
import logger from '../../utils/logger';
import {Context, ContextUser} from '../../context';
import {IResolvers} from 'graphql-tools';


const getTopFieldValues = async (field: string,
                                 query: string,
                                 limit: number | undefined,
                                 user: ContextUser | null): Promise<string[]> => {
  const itemCounts = await esFilterValueCountResults({
    wildcard: { wildcard: { [field]: query } },
    aggsTerms: {
      terms: {
        field: `${field}.raw`,
        size: limit,
        order: { _count : 'desc' }
      }
    },
    limit
  }, user);
  return Object.keys(itemCounts);
};

const padPlusMinus = (s: string) => s.replace(/([+-])/g,' $1 ');

const QueryResolvers: FieldResolversFor<Query, void> = {
  async metadataSuggestions(source, {field, query, limit}, ctx) {
    return getTopFieldValues(`ds_meta.${field}`, `*${query}*`, limit, ctx.user);
  },

  async chemModSuggestions(source, args, ctx) {
    const chemMods = await getTopFieldValues('ds_chem_mods', '*', 10, ctx.user);
    return chemMods.map(chemMod => ({
      chemMod,
      name: `[M${padPlusMinus(chemMod)}]`
    }))
  },

  async neutralLossSuggestions(source, args, ctx) {
    const neutralLosses = await getTopFieldValues('ds_neutral_losses', '*', 10, ctx.user);
    return neutralLosses.map(neutralLoss => ({
      neutralLoss,
      name: `[M${padPlusMinus(neutralLoss)}]`
    }))
  },

  adductSuggestions() {
    return config.adducts;
  },

  async submitterSuggestions(source, {query}, ctx) {
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

  async molecularDatabases(source, args, ctx) {
    try {
      const {hideDeprecated, onlyLastVersion} = args;

      const molDBs = await fetchMolecularDatabases();
      let dbs = molDBs.map(molDB => {
        const deprecated = deprecatedMolDBs.has(molDB.name);
        const superseded = molDBs.some(db => db.name === molDB.name && db.version > molDB.version);
        return {
          ...molDB,
          default: config.defaults.moldb_names.includes(molDB.name),
          hidden: deprecated || superseded,
          deprecated, superseded,
        }
      });
      if (hideDeprecated) {
        dbs = dbs.filter(molDB => !molDB.deprecated);
      }
      if (onlyLastVersion) {
        dbs = dbs.filter(molDB => !molDB.superseded);
      }

      return dbs;
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

};

export const Resolvers = {
  Query: QueryResolvers
} as IResolvers<any, Context>;
