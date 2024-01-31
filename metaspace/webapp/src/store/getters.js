import { mzFilterPrecision } from '../lib/util';
import { decodeParams, decodeSettings, getLevel } from '../modules/Filters';
import config from '../lib/config';

/** For filters where empty string is a valid client-side value that must be converted to empty string for the API */
const noneToEmptyString = s => s === 'none' ? '' : s;

export default {
  filterLevel(state) {
    return getLevel(state.route.path);
  },

  filter(state) {
    return decodeParams(state.route, state.filterLists);
  },

  currentUser(state) {
    return state.currentUser;
  },

  settings(state) {
    return decodeSettings(state.route);
  },

  ftsQuery(state, getters) {
    return getters.filter.simpleQuery;
  },

  gqlAnnotationFilter(state, getters) {
    const filter = getters.filter;
    const colocalizationAlgo = getters.settings.annotationView.colocalizationAlgo;

    const f = {
      compoundQuery: filter.compoundName,
      termId: filter.term ? parseInt(filter.term, 10) : undefined,
      chemMod: noneToEmptyString(filter.chemMod),
      neutralLoss: noneToEmptyString(filter.neutralLoss),
      adduct: filter.adduct,
      annotationId: filter.annotationIds ? filter.annotationIds.join('|') : undefined,
      fdrLevel: filter.fdrLevel,
      pValue: filter.pValue,
      colocalizedWith: filter.colocalizedWith,
      // Only include colocalizationAlgo if there is another filter that uses it. Otherwise the annotations list
      // refreshes unnecessarily when changing algorithm.
      colocalizationAlgo: filter.colocalizedWith || filter.colocalizationSamples ? colocalizationAlgo : null,
      colocalizationSamples: filter.colocalizationSamples,
      offSample: filter.offSample == null ? undefined : !!filter.offSample,
    };

    if (!config.features.neutral_losses && !config.features.advanced_ds_config) {
      f.hasNeutralLoss = false;
    }

    if (!config.features.chem_mods && !config.features.advanced_ds_config) {
      f.hasChemMod = false;
    }

    if (!config.features.all_adducts) {
      f.hasHiddenAdduct = false;
    }

    if (filter.minMSM)
      f.msmScoreFilter = { min: filter.minMSM, max: 1.0 };

    if (filter.mz) {
      const mz = parseFloat(filter.mz),
        deltamz = parseFloat(mzFilterPrecision(filter.mz));
      f.mzFilter = {
        min: (mz - deltamz),
        max: (mz + deltamz)
      };
    }

    f.databaseId = filter.database

    return f;
  },

  gqlDatasetFilter(state, getters) {
    const filter = getters.filter;
    const { group, project, submitter, datasetIds, polarity,
      organism, organismPart, condition, growthConditions,
      ionisationSource, analyzerType, maldiMatrix, metadataType,
      compoundName, datasetOwner, opticalImage } = filter;
    const level = getters.filterLevel;
    const isLogged = state.currentUser && state.currentUser.id
    const hasAnnotationMatching = level === 'dataset' && compoundName ? { compoundQuery: compoundName } : undefined;
    return {
      group: datasetOwner && datasetOwner !== 'my-datasets' && isLogged ? datasetOwner : group,
      project: project,
      submitter: datasetOwner === 'my-datasets' && isLogged ? state.currentUser.id : submitter,

      // temporary workaround because of array-related bugs in apollo-client
      ids: datasetIds ? datasetIds.join("|") : null,

      organism,
      opticalImage,
      organismPart,
      condition,
      growthConditions,
      ionisationSource,
      maldiMatrix,
      analyzerType,
      polarity: polarity ? polarity.toUpperCase() : null,
      metadataType,
      hasAnnotationMatching,
    }
  },

  gqlColocalizationFilter(state, getters) {
    const { datasetIds, colocalizedWith, database, fdrLevel } = getters.filter;
    const colocalizationAlgo = getters.settings.annotationView.colocalizationAlgo;
    if (datasetIds && !datasetIds.includes('|') && colocalizedWith != null && database != null && fdrLevel != null) {
      return { colocalizedWith, colocalizationAlgo, databaseId: database, fdrLevel };
    } else {
      return null;
    }
  },
}
