import InputFilter from './filter-components/InputFilter.vue'
import SingleSelectFilter from './filter-components/SingleSelectFilter.vue'
import SearchableFilter from './filter-components/SearchableFilter.vue'
import OffSampleHelp from './filter-components/OffSampleHelp.vue'
import MzFilter from './filter-components/MzFilter.vue'
import MSMFilter from './filter-components/MSMFilter.vue'
import SearchBox from './filter-components/SearchBox.vue'
import { metadataTypes, defaultMetadataType } from '../../lib/metadataRegistry'
import { Component } from 'vue'
import SimpleFilterBox from './filter-components/SimpleFilterBox.vue'
import BooleanFilter from './filter-components/BooleanFilter.vue'
import config from '../../lib/config'
import AdductFilter from './filter-components/AdductFilter.vue'
import ClassFilter from './filter-components/ClassFilter.vue'
import DatabaseFilter from './filter-components/DatabaseFilter.vue'
import { SingleSelectFilterType } from '../../lib/filterTypes'
import isSnapshot from '../../lib/isSnapshot'

function formatFDR(fdr: number) {
  return fdr ? Math.round(fdr * 100) + '%' : ''
}

function formatPValue(pValue: number) {
  return pValue ? (pValue).toFixed(2) : ''
}

export type Level = 'annotation' | 'dataset' | 'upload' | 'projects' | 'dataset-annotation' | 'enrichment';

export type FilterKey = 'annotationIds' | 'database' | 'datasetIds' | 'minMSM' | 'compoundName'
  | 'chemMod' | 'neutralLoss' | 'adduct' | 'mz' | 'fdrLevel'
  | 'group' | 'project' | 'submitter' | 'polarity' | 'organism' | 'organismPart' | 'condition' | 'growthConditions'
  | 'ionisationSource' | 'maldiMatrix' | 'analyzerType' | 'simpleFilter' | 'simpleQuery' | 'metadataType'
  | 'colocalizedWith' | 'colocalizationSamples' | 'offSample' | 'datasetOwner' | 'molClass' | 'term'
  | 'opticalImage' | 'pValue';

export type MetadataLists = Record<string, any[]>;

/**
 The specifications below describe the presentation logic of filters.
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
export interface FilterSpecification {
  /** Component used for input/display e.g. SingleSelectFilter */
  type: Component;
  /** Name shown on component */
  name: string;
  /** Text used to refer to the filter in the "Add filter" drop-down list */
  description?: string;
  /** Component that contains help text to be displayed as a question mark icon with a popover. Only supported by specific input components */
  helpComponent?: Component;
  /** List of which pages the filter makes sense */
  levels: Level[];
  /** List of which pages the filter should be visible by default */
  defaultInLevels?: Level[];
  /** Initial value of the filter when it is added, or if it is visible by default. Can be a function that is called after MetadataLists is loaded. */
  initialValue: undefined | null | number | string | boolean | ((lists: MetadataLists) => any);
  /** List of options for SingleSelectFilter. Can be a function that is called after MetadataLists is loaded. */
  options?: string | number[] | boolean[] | string[] | ((lists: MetadataLists) => any[]) | SingleSelectFilterType[];
  removable?: boolean;
  filterable?: boolean;
  multiple?: boolean;
  clearable?: boolean;
  hidden?: boolean | (() => boolean);
  debounce?: boolean;
  /** How to encode/decode this filter from the URL */
  encoding?: 'list' | 'json' | 'bool' | 'number';
  /** Callback to format options for display. "options" parameter may be an empty array while the page is loading */
  optionFormatter?(value: any, options: any[]): string;
  /** Callback to extract the "value" of an object-based option */
  valueGetter?(option: any): any;
  sortOrder?: number;
  isMultiFilter?: boolean;
  /** Other filter that should be used for displaying this filter's value */
  multiFilterParent?: FilterKey;
  /** List of other filters whose removal should cause this filter to also be removed */
  dependsOnFilters?: FilterKey[];
  /** List of other filters whose addition should cause this filter to be removed */
  conflictsWithFilters?: FilterKey[];
  convertValueForComponent?: (value: any) => any
}

/** Attrs to pass to the component that will render the filter */
export const FILTER_COMPONENT_PROPS: (keyof FilterSpecification)[] = [
  'name', 'helpComponent',
  'removable', 'filterable', 'multiple', 'clearable',
  'optionFormatter', 'valueGetter',
  'debounce',
]

// @ts-ignore
export const FILTER_SPECIFICATIONS: Record<FilterKey, FilterSpecification> = {
  database: {
    type: DatabaseFilter,
    name: 'Database',
    description: 'Select database',
    levels: ['annotation', 'dataset-annotation', 'enrichment'],
    defaultInLevels: ['annotation', 'enrichment'],
    initialValue: lists =>
      lists.molecularDatabases?.filter(d => d.default)[0]?.id,
    encoding: 'number',
    convertValueForComponent: (v) => v?.toString(),
  },

  datasetIds: {
    type: SearchableFilter,
    name: 'Dataset',
    description: 'Select dataset',
    levels: ['annotation', 'dataset', 'dataset-annotation'],
    initialValue: undefined,
    multiple: true,
    encoding: 'list',
  },

  annotationIds: {
    type: SearchableFilter,
    name: 'Annotation',
    description: 'Select annotation',
    levels: ['annotation'],
    defaultInLevels: ['annotation'],
    hidden: () => !isSnapshot(),
    initialValue: lists =>// @ts-ignore
      lists.annotationIds?.value?.length > 1 ? lists.annotationIds.value : undefined,
    multiple: true,
    encoding: 'list',
  },

  minMSM: {
    type: MSMFilter,
    name: 'Min. MSM',
    description: 'Set minimum MSM score',
    levels: ['annotation', 'dataset-annotation'],
    initialValue: 0.0,
    encoding: 'number',
  },

  compoundName: {
    type: InputFilter,
    name: 'Molecule',
    description: 'Search molecule',
    levels: ['dataset', 'annotation', 'dataset-annotation'],
    initialValue: undefined,
    debounce: true,
  },

  chemMod: {
    type: InputFilter,
    name: 'Chemical modification',
    levels: ['annotation', 'dataset-annotation'],
    initialValue: undefined,
    multiFilterParent: 'adduct',
  },

  neutralLoss: {
    type: InputFilter,
    name: 'Neutral loss',
    levels: ['annotation', 'dataset-annotation'],
    initialValue: undefined,
    multiFilterParent: 'adduct',
  },

  adduct: {
    type: AdductFilter,
    name: 'Adduct',
    description: 'Select adduct',
    levels: ['annotation', 'dataset-annotation'],
    initialValue: undefined,
    options: lists => lists.adducts.filter(a => config.features.all_adducts || !a.hidden),
    isMultiFilter: true,
  },

  molClass: {
    type: ClassFilter,
    name: 'Class',
    description: 'Select class',
    levels: ['annotation'],
    initialValue: undefined,
    isMultiFilter: true,
    hidden: () => !config.features.enrichment,
  },

  term: {
    type: InputFilter,
    name: 'Term',
    levels: ['annotation'],
    initialValue: undefined,
    multiFilterParent: 'molClass',
  },

  mz: {
    type: MzFilter,
    name: 'm/z',
    description: 'Search by m/z',
    levels: ['annotation', 'dataset-annotation'],
    initialValue: 0,
  },

  fdrLevel: {
    type: SingleSelectFilter,
    name: 'FDR',
    description: 'Select FDR level',
    levels: ['annotation', 'dataset-annotation', 'enrichment'],
    defaultInLevels: ['annotation', 'dataset-annotation', 'enrichment'],
    initialValue: 0.1,

    options: [0.05, 0.1, 0.2, 0.5],
    optionFormatter: formatFDR,
    encoding: 'number',
    filterable: false,
    removable: false,
  },

  pValue: {
    type: SingleSelectFilter,
    name: 'p-value threshold',
    description: 'Select p-value threshold',
    levels: ['enrichment'],
    initialValue: undefined,
    options: [0.01, 0.05, 0.1],
    optionFormatter: formatPValue,
    encoding: 'number',
    filterable: false,
    removable: true,
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
    filterable: false,
  },

  organism: {
    type: SingleSelectFilter,
    name: 'Organism',
    description: 'Select organism',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'organisms',
  },

  organismPart: {
    type: SingleSelectFilter,
    name: 'Organism part',
    description: 'Select organism part',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'organismParts',
  },

  condition: {
    type: SingleSelectFilter,
    name: 'Organism condition',
    description: 'Select organism condition',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'conditions',
  },

  growthConditions: {
    type: SingleSelectFilter,
    name: 'Sample growth conditions',
    description: 'Select sample growth conditions',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'growthConditions',
  },

  ionisationSource: {
    type: SingleSelectFilter,
    name: 'Source',
    description: 'Select ionisation source',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'ionisationSources',
  },

  maldiMatrix: {
    type: SingleSelectFilter,
    name: 'Matrix',
    description: 'Select MALDI matrix',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'maldiMatrices',
  },

  analyzerType: {
    type: SingleSelectFilter,
    name: 'Analyzer type',
    description: 'Select analyzer',
    levels: ['annotation', 'dataset'],
    initialValue: undefined,

    options: 'analyzerTypes',
  },

  simpleFilter: {
    type: SimpleFilterBox,
    name: 'Simple filter',
    description: 'Quick access to filter presets',
    levels: ['projects'],
    defaultInLevels: ['projects'],
    initialValue: null,
    removable: false,
    sortOrder: 1,
  },

  simpleQuery: {
    type: SearchBox,
    name: 'Simple query',
    description: 'Search anything',
    levels: ['annotation', 'dataset', 'projects', 'dataset-annotation'],
    defaultInLevels: ['annotation', 'dataset', 'projects', 'dataset-annotation'],
    initialValue: '',
    removable: false,
    sortOrder: 2,
  },

  metadataType: {
    type: SingleSelectFilter,
    name: 'Data type',
    description: 'Select data type',
    levels: ['annotation', 'dataset', 'upload'],
    defaultInLevels: ['annotation', 'dataset', 'upload', 'dataset-annotation'],
    initialValue: defaultMetadataType,
    removable: false,
    options: metadataTypes,
    hidden: () => metadataTypes.length <= 1,
  },

  datasetOwner: {
    type: SimpleFilterBox,
    name: 'Data type',
    description: 'Select data type',
    levels: ['dataset'],
    defaultInLevels: ['dataset'],
    initialValue: null,
    removable: false,
    sortOrder: 1,
  },

  colocalizedWith: {
    type: InputFilter,
    name: 'Colocalized with',
    levels: ['annotation'],
    initialValue: undefined,
    dependsOnFilters: ['fdrLevel', 'database', 'datasetIds'],
    conflictsWithFilters: ['colocalizationSamples'],
  },

  colocalizationSamples: {
    type: BooleanFilter,
    name: 'Representative spatial patterns',
    description: 'Show representative spatial patterns',
    levels: ['annotation'],
    initialValue: true,
    encoding: 'bool',
    dependsOnFilters: ['fdrLevel', 'database', 'datasetIds'],
    conflictsWithFilters: ['colocalizedWith'],
  },

  offSample: {
    type: SingleSelectFilter,
    name: '',
    description: 'Show/hide off-sample annotations',
    helpComponent: OffSampleHelp,
    levels: ['annotation', 'dataset-annotation', 'enrichment'],
    defaultInLevels: [],
    initialValue: false,
    options: [true, false],
    encoding: 'bool',
    optionFormatter: option => `${option ? 'Off' : 'On'}-sample only`,
    hidden: () => !config.features.off_sample,
  },

  opticalImage: {
    type: SingleSelectFilter,
    name: '',
    description: 'Show/hide datasets with optical images',
    levels: ['dataset'],
    defaultInLevels: [],
    initialValue: true,
    options: [true, false],
    encoding: 'bool',
    optionFormatter: option => `${option ? 'With' : 'Without'} optical images only`,
  },
}

export const DATASET_FILTERS: FilterKey[] = [
  'datasetIds', 'group', 'project', 'submitter', 'polarity', 'organism', 'organismPart', 'condition',
  'growthConditions', 'ionisationSource', 'maldiMatrix', 'analyzerType', 'metadataType', 'datasetOwner', 'opticalImage',
]
/** = all annotation-affecting filters - dataset-affecting filters */
export const ANNOTATION_FILTERS: FilterKey[] = [
  'annotationIds', 'database', 'minMSM', 'compoundName', 'adduct', 'mz', 'fdrLevel', 'colocalizedWith', 'offSample',
  'opticalImage',
]
/** Filters that are very specific to particular annotations and should be cleared when navigating to other annotations */
export const ANNOTATION_SPECIFIC_FILTERS: FilterKey[] = [
  'compoundName', 'adduct', 'mz', 'colocalizedWith', 'colocalizationSamples', 'simpleQuery',
]

export function getFilterInitialValue(key: FilterKey, filterLists?: MetadataLists) {
  let value = FILTER_SPECIFICATIONS[key].initialValue

  if (typeof value === 'function') {
    if (filterLists != null) {
      value = value(filterLists)
    } else {
      value = null
    }
  }
  return value
}

export function getDefaultFilter(level: Level, filterLists?: MetadataLists) {
  const filter: Partial<Record<FilterKey, any>> = {}
  let key: FilterKey
  for (key in FILTER_SPECIFICATIONS) {
    const spec = FILTER_SPECIFICATIONS[key]
    if (spec.defaultInLevels != null && spec.defaultInLevels.includes(level)) {
      filter[key] = getFilterInitialValue(key, filterLists)
    }
  }
  return filter
}
