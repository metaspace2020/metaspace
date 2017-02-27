import { renderMolFormula } from './util.js';
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
    return renderMolFormula('M', adduct, ADDUCT_POLARITY[adduct])
  }
}

/*
   Introduction of a new filter requires:
   * type (one of the suitable filter components)
   * name: short name, will be shown on the 'tags'
   * description: what will be shown as a select option
   * levels: on which pages the filter makes sense;
     currently 'annotation' and 'dataset' are used
   * initialValue: what will be the filter value when it's created
   * any required settings for the chosen filter component
     (e.g. 'options' for SingleSelectFilter/MultipleSelectFilter)

   In addition, there are some optional settings, such as
   'removable' (applicable to every filter) or 'filterable'.

   The specifications below describe only the presentation logic.
   Once a filter is added to the specifications list, any pages
   making use of it must also implement the data filtering logic,
   e.g. adding GraphQL query variables and setting them accordingly.

   Data filtering logic is currently concentrated in the store:
   * add new fields to DEFAULT_FILTER and FILTER_TO_URL (for vue-router)
   * edit gqlAnnotationFilter and gqlDatasetFilter getters

   If options to a select are provided as a string, they are taken from
   FilterPanel computed properties. When a new filter is added that uses
   this feature, the GraphQL query in FilterPanel should be tweaked to
   incorporate any extra fields that are needed to populate the options,
   and a new computed property with the name must be added.
*/

const FILTER_SPECIFICATIONS = {
  database: {
    type: SingleSelectFilter,
    name: 'Database',
    description: 'Select database',
    levels: ['annotation'],
    initialValue: 'HMDB', // because we've agreed to process every dataset with it

    // FIXME: hard-coded, should be taken from the server
    options: ['HMDB', 'ChEBI', 'LIPID_MAPS', 'SwissLipids'],
    removable: false
  },

  datasetName: {
    type: SingleSelectFilter,
    name: 'Dataset',
    description: 'Select dataset',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    // string instead of a list  means take from Vue instance
    options: 'datasetNames'
  },

  minMSM: {
    type: InputFilter,
    name: 'Min. MSM',
    description: 'Set minimum MSM score',
    levels: ['annotation'],
    initialValue: 0.0
  },

  compoundName: {
    type: InputFilter,
    name: 'Compound',
    description: 'Search compound',
    levels: ['annotation'],
    initialValue: ''
  },

  adduct: {
    type: SingleSelectFilter,
    name: 'Adduct',
    description: 'Select adduct',
    levels: ['annotation'],
    initialValue: null,

    options: [null, '+H', '-H', '+Na', '+Cl', '+K'],
    optionFormatter: formatAdduct,
    valueFormatter: formatAdduct
  },

  mz: {
    type: InputFilter,
    name: 'm/z (±5 ppm)',
    description: 'Search by m/z (±5 ppm)',
    levels: ['annotation'],
    initialValue: undefined
  },

  fdrLevel: {
    type: SingleSelectFilter,
    name: 'FDR',
    description: 'Select FDR level',
    levels: ['annotation'],
    initialValue: 0.1,

    options: ['0.05', '0.1', '0.2'],
    filterable: false
  },

  institution: {
    type: SingleSelectFilter,
    name: 'Institution',
    description: 'Select institution',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'institutionNames' // take from Vue instance
  },

  polarity: {
    type: SingleSelectFilter,
    name: 'Polarity',
    description: 'Select polarity',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    // FIXME: this ideally should be taken straight from the JSON schema
    options: ['Positive', 'Negative'],
    filterable: false
  },

  organism: {
    type: SingleSelectFilter,
    name: 'Organism',
    description: 'Select organism',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'organisms'
  },

  ionisationSource: {
    type: SingleSelectFilter,
    name: 'Source',
    description: 'Select ionisation source',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'ionisationSources'
  },

  maldiMatrix: {
    type: SingleSelectFilter,
    name: 'Matrix',
    description: 'Select MALDI matrix',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'maldiMatrices'
  }
};

export { FILTER_SPECIFICATIONS as default };
