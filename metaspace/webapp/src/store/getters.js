import {mzFilterPrecision} from '../util';
import {decodeParams, decodeSettings} from '../url';

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
    const f = {
      database: filter.database,
      compoundQuery: filter.compoundName,
      adduct: filter.adduct,
      fdrLevel: filter.fdrLevel
    };

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
    const {institution, submitter, datasetIds, polarity,
           organism, organismPart, condition, growthConditions,
           ionisationSource, analyzerType, maldiMatrix, metadataType} = filter;
    return {
      institution,
      submitter,

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
  }
}
