import {mzFilterPrecision} from '../util';
import {decodeParams, decodeSettings} from '../modules/Filters';
import config from '../config';

/** For filters where empty string is a valid client-side value that must be converted to empty string for the API */
const noneToEmptyString = s => s === 'none' ? '' : s;

export default {
  filter(state) {
    return decodeParams(state.route, state.filterLists);
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
      database: filter.database,
      compoundQuery: filter.compoundName,
      chemMod: noneToEmptyString(filter.chemMod),
      neutralLoss: noneToEmptyString(filter.neutralLoss),
      adduct: filter.adduct,
      fdrLevel: filter.fdrLevel,
      colocalizedWith: filter.colocalizedWith,
      colocalizationAlgo,
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
      f.msmScoreFilter = {min: filter.minMSM, max: 1.0};

    if (filter.mz) {
      const mz = parseFloat(filter.mz),
            deltamz = parseFloat(mzFilterPrecision(mz));
      f.mzFilter = {
        min: mz - deltamz,
        max: mz + deltamz
      };
    }

    return f;
  },

  gqlDatasetFilter(state, getters) {
    const filter = getters.filter;
    const {group, project, submitter, datasetIds, polarity,
           organism, organismPart, condition, growthConditions,
           ionisationSource, analyzerType, maldiMatrix, metadataType} = filter;
    return {
      group: group,
      project: project,
      submitter: submitter,

      // temporary workaround because of array-related bugs in apollo-client
      ids: datasetIds ? datasetIds.join("|") : null,

      organism,
      organismPart,
      condition,
      growthConditions,
      ionisationSource,
      maldiMatrix,
      analyzerType,
      polarity: polarity ? polarity.toUpperCase() : null,
      metadataType
    }
  },

  gqlColocalizationFilter(state, getters) {
    const {datasetIds, colocalizedWith, database, fdrLevel} = getters.filter;
    const colocalizationAlgo = getters.settings.annotationView.colocalizationAlgo;
    if (datasetIds && !datasetIds.includes('|') && colocalizedWith != null && database != null && fdrLevel != null) {
      return {colocalizedWith, colocalizationAlgo, database, fdrLevel};
    } else {
      return null;
    }
  },
}
