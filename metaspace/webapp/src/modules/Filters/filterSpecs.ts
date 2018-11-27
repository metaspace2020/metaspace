import { renderMolFormula } from '../../util';
import InputFilter from './filter-components/InputFilter.vue';
import SingleSelectFilter from './filter-components/SingleSelectFilter.vue';
import SearchableFilter from './filter-components/SearchableFilter.vue';
import MzFilter from './filter-components/MzFilter.vue';
import SearchBox from './filter-components/SearchBox.vue';
import {metadataTypes, defaultMetadataType} from '../../assets/metadataRegistry';
import { Component } from 'vue';
import SimpleFilterBox from './filter-components/SimpleFilterBox.vue';

// Filled during the initialization of adduct filter below
const ADDUCT_POLARITY: Record<string, string> = {};

function formatAdduct (adduct: string) {
  if (adduct === null)
    return '';
  else {
    return renderMolFormula('M', adduct, ADDUCT_POLARITY[adduct])
  }
}

function formatFDR (fdr: number) {
  return fdr ? Math.round(fdr * 100) + '%' : '';
}

/*
   Introduction of a new filter requires:
   * type (one of the suitable filter components)
   * name: short name, will be shown on the 'tags'
   * description: what will be shown as a select option
   * levels: on which pages the filter makes sense;
     currently 'annotation' and 'dataset' are used
   * defaultInLevels: on which pages the filter should be active by default
   * initialValue: what will be the filter value when it's created
   * hidden: whether to hide the filter from the UI
   * any required settings for the chosen filter component
     (e.g. 'options' for SingleSelectFilter/MultipleSelectFilter)

   In addition, there are some optional settings, such as
   'removable' (applicable to every filter) or 'filterable'.

   The specifications below describe only the presentation logic.
   Once a filter is added to the specifications list, any pages
   making use of it must also implement the data filtering logic,
   e.g. adding GraphQL query variables and setting them accordingly.

   Data filtering logic is currently located in two places:
   * url.ts
     add new fields to FILTER_TO_URL (for vue-router)
   * store/getters.js
     edit gqlAnnotationFilter and gqlDatasetFilter getters

   You must also add the filter key to filterKeys array in FilterPanel.vue:
   this controls the order of the filters in the dropdown list.

   If options to a select are provided as a string, they are taken from
   FilterPanel computed properties. When a new filter is added that uses
   this feature, fetchOptionListsQuery in api/metadata.js should be tweaked to
   incorporate any extra fields that are needed to populate the options.
*/

export type Level = 'annotation' | 'dataset' | 'upload' | 'projects';

export type FilterKey = 'database' | 'datasetIds' | 'minMSM' | 'compoundName' | 'adduct' | 'mz' | 'fdrLevel'
  | 'group' | 'project' | 'submitter' | 'polarity' | 'organism' | 'organismPart' | 'condition' | 'growthConditions'
  | 'ionisationSource' | 'maldiMatrix' | 'analyzerType' | 'simpleFilter' | 'simpleQuery' | 'metadataType';

export type MetadataLists = Record<string, any[]>;

export interface FilterSpecification {
  type: Component;
  name: string;
  description?: string;
  levels: Level[];
  defaultInLevels?: Level[];
  initialValue: undefined | null | number | string | ((lists: MetadataLists) => any);
  options?: string | number[] | string[] | ((lists: MetadataLists) => any[]);
  removable?: boolean;
  filterable?: boolean;
  multiple?: boolean;
  hidden?: boolean | (() => boolean);
  encoding?: 'list' | 'json';
  optionFormatter?(value: any): string;
  valueFormatter?(value: any): string;
  valueKey?: string;
  sortOrder?: number;
}

export const FILTER_SPECIFICATIONS: Record<FilterKey, FilterSpecification> = {
  database: {
    type: SingleSelectFilter,
    name: 'Database',
    description: 'Select database',
    levels: ['annotation'],
    defaultInLevels: ['annotation'],
    initialValue: lists => lists.molecularDatabases
                                .filter(d => d.default)
                                .map(d => d.name)[0],
    options: lists => lists.molecularDatabases.map(d => d.name),
    removable: false
  },

  datasetIds: {
    type: SearchableFilter,
    name: 'Dataset',
    description: 'Select dataset',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,
    multiple: true,
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
    initialValue: undefined,
    options: lists => lists.adducts.map(d => {
      const {adduct, charge} = d;
      ADDUCT_POLARITY[adduct] = charge > 0 ? 'POSITIVE' : 'NEGATIVE';
      return adduct;
    }),
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
    defaultInLevels: ['annotation'],
    initialValue: 0.1,

    options: [0.05, 0.1, 0.2, 0.5],
    optionFormatter: formatFDR,
    valueFormatter: formatFDR,
    filterable: false,
    removable: false
  },

  group: {
    type: SearchableFilter,
    name: 'Group',
    description: 'Select group',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,
  },

  project: {
    type: SearchableFilter,
    name: 'Project',
    description: 'Select project',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,
  },

  submitter: {
    type: SearchableFilter,
    name: 'Submitter',
    description: 'Select submitter',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,
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

  simpleFilter: {
    type: SimpleFilterBox,
    name: 'Simple filter',
    description: 'Quick access to filter presets',
    levels: ['projects'],
    defaultInLevels: ['projects'],
    initialValue: null,
    removable: false,
    sortOrder: 1
  },

  simpleQuery: {
    type: SearchBox,
    name: 'Simple query',
    description: 'Search anything',
    levels: ['annotation', 'dataset', 'projects'],
    defaultInLevels: ['annotation', 'dataset', 'projects'],
    initialValue: '',
    removable: false,
    sortOrder: 2
  },

  metadataType: {
    type: SingleSelectFilter,
    name: 'Data type',
    description: 'Select data type',
    levels: ['annotation', 'dataset', 'upload'],
    defaultInLevels: ['annotation', 'dataset', 'upload'],
    initialValue: defaultMetadataType,
    removable: false,
    options: metadataTypes,
    hidden: () => metadataTypes.length <= 1
  }
};

export function getFilterInitialValue(key: FilterKey, filterLists?: MetadataLists) {
  let value = FILTER_SPECIFICATIONS[key].initialValue;

  if(typeof value === 'function') {
    if(filterLists != null) {
      value = value(filterLists);
    } else {
      value = null;
    }
  }
  return value;
}

export function getDefaultFilter(level: Level, filterLists?: MetadataLists) {
  const filter: Partial<Record<FilterKey, any>> = {};
  let key: FilterKey;
  for (key in FILTER_SPECIFICATIONS) {
    const spec = FILTER_SPECIFICATIONS[key];
    if (spec.defaultInLevels != null && spec.defaultInLevels.includes(level)) {
      filter[key] = getFilterInitialValue(key, filterLists);
    }
  }
  return filter;
}

