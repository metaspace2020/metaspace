import { renderMolFormula } from './util';
import InputFilter from './components/InputFilter.vue';
import SingleSelectFilter from './components/SingleSelectFilter.vue';
import MultiSelectFilter from './components/MultiSelectFilter.vue';
import DatasetNameFilter from './components/DatasetNameFilter.vue';
import MzFilter from './components/MzFilter.vue';
import SearchBox from './components/SearchBox.vue';

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

function formatFDR (fdr) {
  return fdr ? Math.round(fdr * 100) + '%' : null;
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

   Data filtering logic is currently located in two places:
   * url.js
     add new fields to DEFAULT_FILTER and FILTER_TO_URL (for vue-router)
   * store/getters.js
     edit gqlAnnotationFilter and gqlDatasetFilter getters

   You must also add the filter key to filterKeys array in FilterPanel.vue:
   this controls the order of the filters in the dropdown list.

   If options to a select are provided as a string, they are taken from
   FilterPanel computed properties. When a new filter is added that uses
   this feature, fetchOptionListsQuery in api/metadata.js should be tweaked to
   incorporate any extra fields that are needed to populate the options.
*/

const FILTER_SPECIFICATIONS = {
  database: {
    type: SingleSelectFilter,
    name: 'Database',
    description: 'Select database',
    levels: ['annotation'],
    initialValue: 'HMDB-v2.5', // because we've agreed to process every dataset with it

    options: lists => lists.molecularDatabases.map(d => d.name),
    removable: false
  },

  datasetIds: {
    type: DatasetNameFilter,
    name: 'Dataset',
    description: 'Select dataset',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    encoding: 'list'
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
    name: 'Molecule',
    description: 'Search molecule',
    levels: ['annotation'],
    initialValue: undefined
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
    type: MzFilter,
    name: 'm/z',
    description: 'Search by m/z',
    levels: ['annotation'],
    initialValue: undefined
  },

  fdrLevel: {
    type: SingleSelectFilter,
    name: 'FDR',
    description: 'Select FDR level',
    levels: ['annotation'],
    initialValue: 0.1,

    options: [0.05, 0.1, 0.2, 0.5],
    optionFormatter: formatFDR,
    valueFormatter: formatFDR,
    filterable: false,
    removable: false
  },

  institution: {
    type: SingleSelectFilter,
    name: 'Lab',
    description: 'Select lab',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'institutionNames' // take from Vue instance
  },

  submitter: {
    type: SingleSelectFilter,
    name: 'Submitter',
    description: 'Select submitter',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    encoding: 'json',
    options: lists => lists.submitterNames.map(x => {
      const {name, surname} = x;
      return {name, surname};
    }),
    optionFormatter: ({name, surname}) => name + ' ' + surname,
    valueFormatter: ({name, surname}) => name + ' ' + surname
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

  organismPart: {
    type: SingleSelectFilter,
    name: 'Organism part',
    description: 'Select organism part',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'organismParts'
  },

  condition: {
    type: SingleSelectFilter,
    name: 'Organism condition',
    description: 'Select organism condition',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'conditions'
  },

  growthConditions: {
    type: SingleSelectFilter,
    name: 'Sample growth conditions',
    description: 'Select sample growth conditions',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'growthConditions'
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
  },

  analyzerType: {
    type: SingleSelectFilter,
    name: 'Analyzer type',
    description: 'Select analyzer',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'analyzerTypes'
  },

  simpleQuery: {
    type: SearchBox,
    name: 'Simple query',
    description: 'Search anything',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,
    removable: false
  }
};

export { FILTER_SPECIFICATIONS as default };
