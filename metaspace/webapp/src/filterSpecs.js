import { renderSumFormula } from './util.js';
import InputFilter from './components/InputFilter.vue';
import SingleSelectFilter from './components/SingleSelectFilter.vue';
import MultiSelectFilter from './components/MultiSelectFilter.vue';

// FIXME: hard-coded adducts
const ADDUCT_POLARITY = {
  '+H': 'POSITIVE',
  '+Na': 'POSITIVE',
  '+K': 'POSITIVE',
  '-H': 'NEGATIVE',
  '+Cl': 'NEGATIVE',
};

function formatAdduct (adduct) {
  if (adduct === null)
    return '';
  else {
    return renderSumFormula('M', adduct, ADDUCT_POLARITY[adduct])
  }
}

const FILTER_SPECIFICATIONS = {
  database: {
    type: SingleSelectFilter,
    name: 'Database',
    description: 'Select database',
    initialValue: 'HMDB', // because we've agreed to process every dataset with it

    // FIXME: hard-coded, should be taken from the server
    options: ['HMDB', 'ChEBI', 'LIPID_MAPS', 'SwissLipids'],
    removable: false
  },

  datasetName: {
    type: SingleSelectFilter,
    name: 'Dataset',
    description: 'Select dataset',
    initialValue: '',

    options: 'datasetNames' // take from Vue instance
  },

  minMSM: {
    type: InputFilter,
    name: 'Min. MSM',
    description: 'Set minimum MSM score',
    initialValue: 0.0
  },

  compoundName: {
    type: InputFilter,
    name: 'Compound',
    description: 'Search compound',
    initialValue: ''
  },

  adduct: {
    type: SingleSelectFilter,
    name: 'Adduct',
    description: 'Select adduct',
    initialValue: null,

    options: [null, '+H', '-H', '+Na', '+Cl', '+K'],
    optionFormatter: formatAdduct,
    valueFormatter: formatAdduct
  },

  mz: {
    type: InputFilter,
    name: 'm/z (±5 ppm)',
    description: 'Search by m/z (±5 ppm)',
    initialValue: ''
  },

  fdrLevel: {
    type: SingleSelectFilter,
    name: 'FDR',
    description: 'Select FDR level',
    initialValue: 0.1,

    options: ['0.05', '0.1', '0.2'],
    filterable: false
  }
};

export { FILTER_SPECIFICATIONS as default };
