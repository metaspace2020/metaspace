import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from '@vue/composition-api'
// @ts-ignore
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import {
  SVGRenderer,
} from 'echarts/renderers'
import {
  ScatterChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
} from 'echarts/components'
import './MassSpecSummaryChart.scss'
import { useQuery } from '@vue/apollo-composable'
import { DatasetDetailItem } from '../../../api/dataset'
import gql from 'graphql-tag'
import { sortBy } from 'lodash-es'

use([
  SVGRenderer,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
])

interface MassSpecSummaryChartProps {
  isEmpty: boolean
  isLoading: boolean
  isDataLoading: boolean
  data: any[]
  annotatedData: any[]
  peakFilter: number
  normalization: number | undefined
  dataRange: any
  annotatedLabel: string
}

interface MassSpecSummaryChartState {
  scaleIntensity: boolean
  chartOptions: any
  size: number
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
  OFF: 3,
}

export const MassSpecSummaryChart = defineComponent<MassSpecSummaryChartProps>({
  name: 'MassSpecSummaryChart',
  props: {
    isEmpty: {
      type: Boolean,
      default: true,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    isDataLoading: {
      type: Boolean,
      default: false,
    },
    annotatedLabel: {
      type: String,
    },
    data: {
      type: Array,
      default: () => [],
    },
    dataRange: {
      type: Object,
      default: () => { return { maxX: 0, maxY: 0, minX: 0, minY: 0 } },
    },
    annotatedData: {
      type: Array,
      default: () => [],
    },
    peakFilter: {
      type: Number,
      default: PEAK_FILTER.ALL,
    },
    normalization: {
      type: Number,
    },
  },
  setup(props, { emit, root }) {
    const { $store } = root

    const matrixes = ['DESI', 'IR-MALDESI', 'NanoDESI', 'LAESI', 'SIMS', 'Other', 'MALDI-DHB', 'MALDI-CHCA', 'MALDI-DAN', 'MALDI-2,5-DHAP', 'MALDI-Mix', 'MALDI-N/A', 'MALDI-Norharmane', 'MALDI-NEDC', 'MALDI-9AA', 'MALDI-PNA', 'MALDI-MBT', 'MALDI-CMBT', 'MALDI-sDHB', 'MALDI-Other']

    // prettier-ignore
    const analyzers = ['Other', 'QTOF', 'TOF', 'Orbitrap', 'FTICR']

    const mock = {
      countDatasetsPerGroup: {
        counts: [
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 2923,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 401,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 2215,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 103,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dan',
              'negative',
            ],
            count: 2006,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dan',
              'positive',
            ],
            count: 260,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 864,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dhb',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '9aa',
              'negative',
            ],
            count: 415,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '9aa',
              'positive',
            ],
            count: 45,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dan-9aa',
              'negative',
            ],
            count: 406,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 270,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '9-aminoacridine (9aa)',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 251,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 223,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '1,5-diaminonaphthalene (dan)+hcl',
              'negative',
            ],
            count: 183,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'gold',
              'positive',
            ],
            count: 155,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 146,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'pna',
              'positive',
            ],
            count: 86,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'pna',
              'negative',
            ],
            count: 16,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'norharmane',
              'positive',
            ],
            count: 49,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'norharmane',
              'negative',
            ],
            count: 42,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dha',
              'positive',
            ],
            count: 77,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '1,8-bis(dimethylamino)naphthalene (dman)',
              'negative',
            ],
            count: 67,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'none',
              'positive',
            ],
            count: 40,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'none',
              'negative',
            ],
            count: 15,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 43,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'chca',
              'positive',
            ],
            count: 42,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dan+9aa',
              'negative',
            ],
            count: 39,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'universal dhb chca',
              'positive',
            ],
            count: 29,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'universal dhb chca',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'au',
              'positive',
            ],
            count: 22,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'au',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'bzpy',
              'positive',
            ],
            count: 13,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'bzpy',
              'negative',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)/ag',
              'positive',
            ],
            count: 19,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'norharmane/nrm',
              'positive',
            ],
            count: 13,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'norharmane/nrm',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2-mercaptobenzothiazole (mbt)',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2-mercaptobenzothiazole (mbt)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'bzp',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'bzp',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)/gold sputter',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '1,5-diaminonaphthalene (dan) | dhb',
              'negative',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '1,5-diaminonaphthalene (dan) | dhb',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'nedc | 9aa | chca | dhb | dan',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'nedc | 9aa | chca | dhb | dan',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2,5 dhap',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'gold + kac',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'gold, kac',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'gold/dhb/kac',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'mix',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'mix',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'special',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'test2',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dph',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dph',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'thap',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '1,5-diaminonaphthalene (dan), dhb',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '1,5-diaminonaphthalene (dan), dhb',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '4-nitroaniline',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '4-nitroaniline',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'ag',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'ag',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'kac chca',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'na',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'tmpy',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)/fe3o4 binary mix',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '5-chloro-2-mercaptobenzothiazole (cmbt)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '5-chloro-2-mercaptobenzothiazole (cmbt)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'au/kch3cooh',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dhb and dan',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dhb and dan',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'gold/dhap/kac',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'gold/dhb',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'n/a',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'nedc ',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'norharmane/gold sputter',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'sodium gold',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'au and sodium acetate',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'cu',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'cu',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dhb/au',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dhb/gold',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'gold/kac',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'ni',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'ni',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'nrm',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'nrm',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'pt',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'pt',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'sdhb',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'silver',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '1,5-diaminonaphthalene hydrochloride (dan*hcl)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              "2',6'-dihydroxyacetophenone (dhap)",
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '9-aa',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              '9aa | dan | nedc',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'au/dhb',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'chch',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dhb/chca',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dhb/fe3o4',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'dhp',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'di2pym',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'graphene oxide',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'norharmane (nrm)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'ti',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'desi',
              'none',
              'negative',
            ],
            count: 1732,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'desi',
              'none',
              'positive',
            ],
            count: 307,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'desi',
              'n/a',
              'negative',
            ],
            count: 218,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'desi',
              'n/a',
              'positive',
            ],
            count: 89,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'desi',
              '',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'desi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'none',
              'positive',
            ],
            count: 1175,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'none',
              'negative',
            ],
            count: 206,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'ice',
              'positive',
            ],
            count: 150,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'ice',
              'negative',
            ],
            count: 12,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'glycerol',
              'positive',
            ],
            count: 15,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'n/a',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'n/a',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'ice and sucrose',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'ice and sucrose',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'sucrose',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ir-maldesi',
              'sucrose',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 420,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 82,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 274,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 24,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 276,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'dan',
              'positive',
            ],
            count: 83,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'dan',
              'negative',
            ],
            count: 66,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 36,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '9-aminoacridine (9aa)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'dhb',
              'positive',
            ],
            count: 37,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'sodium + gold',
              'positive',
            ],
            count: 26,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'norharmane',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'norharmane',
              'negative',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '4-nitroaniline',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '4-nitroaniline',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '2,5-dihydroxybenzoic acid',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '2,5-dihydroxybenzoic acid',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '9-aminoacridine',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '9-aminoacridine',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '1,5-diaminonaphthalene',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '1,5-diaminonaphthalene',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '2,5-dihydroxyacetophenone',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '2,5-dihydroxyacetophenone',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'n-(1-naphthyl)ethylenediamine dihydrochloride',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'n-(1-naphthyl)ethylenediamine dihydrochloride',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '4-chloro-alpha-cyanocinnamic acid',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '4-chloro-alpha-cyanocinnamic acid',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '4-chlorocyanocinnamic acid (clcca)',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '4-chlorocyanocinnamic acid (clcca)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '5-chloro-2-mercaptobenzothiazole (cmbt)',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '5-chloro-2-mercaptobenzothiazole (cmbt)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'alpha-cyano-4-hydroxycinnamic acid',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'alpha-cyano-4-hydroxycinnamic acid',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '5-chloro-2-mercaptobenzothiazole',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '5-chloro-2-mercaptobenzothiazole',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'maleic anhydride proton sponge',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'maleic anhydride proton sponge',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'pndi-t2',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'pndi-t2',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'maleic anhydride proton sponge (maps)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'maleic anhydride proton sponge (maps)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'pndi(t2)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'pndi(t2)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '4-n',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '4-n',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '9aa',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'benzophenone',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'bnz',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'chca',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'nedc',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'nedc',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'none',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'universal dhb chca',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '1,5-diaminonaphthalene (dan) | dhb',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              '2,4,6-trihydroxyacetophenone (thap)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'au',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'dha',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'gold',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'multiple',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5',
              'n/a',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'irmaldesi',
              'none',
              'positive',
            ],
            count: 433,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'irmaldesi',
              'none',
              'negative',
            ],
            count: 176,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'irmaldesi',
              'ice',
              'positive',
            ],
            count: 52,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'irmaldesi',
              'ice',
              'negative',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 250,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 124,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 36,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 15,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'dhb',
              'positive',
            ],
            count: 45,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'sdhb',
              'positive',
            ],
            count: 26,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 25,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 21,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              "2',5'-dihydroxyacetophenone (dhap)",
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              "2',5'-dihydroxyacetophenone (dhap)",
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'chca',
              'positive',
            ],
            count: 12,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'thbph',
              'positive',
            ],
            count: 12,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'dhap',
              'negative',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'dhap',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              '4-nitroaniline',
              'negative',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'nedc',
              'negative',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'none',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'tetrazol 1',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'benzophenone',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'dan',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'diuthame',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              '9-aa',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'dmpa',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'dmpa',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              '9aa',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'tetrazol 4',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'tetrazol 7',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'bp',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'n/a',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5 af',
              'test',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 178,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 58,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 35,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 89,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              'none',
              'negative',
            ],
            count: 89,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 56,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              'chca',
              'positive',
            ],
            count: 17,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              'norharmane',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              'norharmane',
              'negative',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              '2,4,6-trihydroxyacetophenone (thap)',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              '2,4,6-trihydroxyacetophenone (thap)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              "2',6'-dihydroxyacetophenone (dhap)",
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              "2',6'-dihydroxyacetophenone (dhap)",
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              '2-mercaptobenzothiazole (mbt)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              'diuthame',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              'dan',
              'negative',
            ],
            count: 79,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              'dan',
              'positive',
            ],
            count: 13,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 85,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              'dhb',
              'positive',
            ],
            count: 76,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 57,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              'chca',
              'positive',
            ],
            count: 25,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              'chca',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              'none',
              'positive',
            ],
            count: 18,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              'none',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              '9aa',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              '2.5-dhb',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              '4-nitroaniline',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              '4-nitroaniline',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              '2,5-dihydroxybenzoic acid  (dhb))',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 87,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'sdhb',
              'positive',
            ],
            count: 87,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'sdhb',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 21,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'dhap',
              'positive',
            ],
            count: 13,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'dhap',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 16,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'dhb',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'pna',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'pna',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              '',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'dan',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'dhb 50 mg/ml',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 10',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-maldi uhr',
              'dhb',
              'positive',
            ],
            count: 207,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'prototype',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 91,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'prototype',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 81,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'prototype',
              'pna',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'prototype',
              '4-nitroaniline',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'prototype',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'lesa',
              'n/a',
              'positive',
            ],
            count: 28,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'lesa',
              'n/a',
              'negative',
            ],
            count: 23,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'lesa',
              'none',
              'positive',
            ],
            count: 20,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'lesa',
              'none',
              'negative',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'lesa',
              'universal dhb chca',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi2',
              'dan',
              'negative',
            ],
            count: 36,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi2',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi2',
              'dhb',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi2',
              'nedc',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi2 prototype',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 29,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi2 prototype',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi2 prototype',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5 af',
              'none',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5 af',
              'none',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5 af',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5 af',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5 af',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi 5 af',
              'lactic acid',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'desi-msi',
              'none',
              'positive',
            ],
            count: 26,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'desi-msi',
              'none',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'nanodesi',
              'none',
              'positive',
            ],
            count: 21,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'nanodesi',
              'none',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'nanodesi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              't-maldi-2',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 13,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              't-maldi-2',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              't-maldi-2',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              't-maldi-2',
              'dhap',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              't-maldi-2',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-ir-plasma-ldi',
              'none',
              'negative',
            ],
            count: 12,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-ir-plasma-ldi',
              'none',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5-af',
              '2,5-dihydroxybenzoic acid',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5-af',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5-af',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5-af',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5-af',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5-af',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5-af',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi5-af',
              '9-aminoacridine',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'nano-desi',
              'none',
              'positive',
            ],
            count: 14,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'nano-desi',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'nano-desi',
              'n/a',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'uv-maldesi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 20,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'apsmaldi2',
              'dhb',
              'positive',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'apsmaldi2',
              'dan',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'apsmaldi2',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi',
              'no2,5-dihydroxybenzoic acid (dhb)ne',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi10',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi10',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi10',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi10',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-ldi-ppi',
              'none',
              'negative',
            ],
            count: 13,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'esi',
              'none',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'esi',
              'none',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi-2',
              '2,5-dihydroxyacetophenone',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi-2',
              '2,5-dihydroxyacetophenone',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi-2',
              'fbph',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'sicrit',
              'dhb',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'sicrit',
              'none',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'afadesi',
              'none',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'afadesi',
              'none',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ar-sims',
              'n/a',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ar-sims',
              'none',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'laesi',
              'none',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'laesi',
              'none',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'sims',
              'n/a',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'sims',
              'n/a',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi2 af',
              "2',5'-dihydroxyacetophenone (dhap)",
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ap-smaldi2 af',
              "2',5'-dihydroxyacetophenone (dhap)",
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'tg-maldi-2',
              'dhap',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'la-apci',
              'none',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'apmaldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi 2',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'maldi 2',
              'dhb',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'argon gcib',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'diva',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap',
              'ld-reims',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1399,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 39,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'hcca',
              'positive',
            ],
            count: 389,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'hcca',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 338,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'dhb',
              'negative',
            ],
            count: 50,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 236,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 147,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 336,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'negative',
            ],
            count: 29,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'chca',
              'positive',
            ],
            count: 296,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'chca',
              'negative',
            ],
            count: 39,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 301,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '9-aminoacridine (9aa)',
              'positive',
            ],
            count: 12,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 256,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'norharmane',
              'negative',
            ],
            count: 178,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'norharmane',
              'positive',
            ],
            count: 17,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'bpyn',
              'negative',
            ],
            count: 68,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'bpyn',
              'positive',
            ],
            count: 14,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'none',
              'positive',
            ],
            count: 42,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'none',
              'negative',
            ],
            count: 29,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '9aa',
              'negative',
            ],
            count: 54,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 54,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'bpyn ',
              'negative',
            ],
            count: 49,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'bpyn ',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 48,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'dhb/chca',
              'positive',
            ],
            count: 32,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan) / graphene',
              'positive',
            ],
            count: 21,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan) / graphene',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'trans-2-[3-(4-tert-butylphenyl)-2-methyl-2-propenylidene] malononitrile (dctb)',
              'negative',
            ],
            count: 19,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'ndec',
              'negative',
            ],
            count: 17,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 17,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '4-phenyl-alpha-cyanocinnamic acid amide',
              'negative',
            ],
            count: 13,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'zsa',
              'negative',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'universal dhb chca',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'fmp-10',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'super dhb',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'super dhb',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'n/a',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'n/a',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'dhb, chca',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc) and bpyn',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'sdhb',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'dan',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '1,8,9-anthracenetriol (dithranol)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)/1,5-dhap',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '9-aa',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'norhramne',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '2,5-dihydroxy benzoic acid (dhb)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'bndm',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'bndm',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'flexmaldi-2',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'noharmane',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'norharman',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'norharman',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'pna',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'quercetin',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'quercetin',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'thap',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'thap',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan)+hcl',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '1,8-bis-(l-pyrrolidinyl)naphthalene',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              '2,3-dicyanohydroquinone',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'bpyn and n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'dios',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'nhm',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'quercertin',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi',
              'α-cyano-4-hydroxycinnamic acid',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'nano-desi',
              'none',
              'positive',
            ],
            count: 39,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'nanodesi',
              'none',
              'positive',
            ],
            count: 28,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'ldi',
              'none',
              'positive',
            ],
            count: 16,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'dios',
              'dios',
              'positive',
            ],
            count: 12,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'dios',
              'dios',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'laesi',
              'none',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'laesi',
              'none',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              ' maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              ' maldi',
              'norharmane',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'desi',
              'none',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'desi',
              'none',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'c60 (sims)',
              'none',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr',
              'maldi-2',
              'dhb',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'dan',
              'negative',
            ],
            count: 909,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'dan',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 534,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 21,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 145,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 29,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 122,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 114,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'dhb',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 55,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 33,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 40,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '9-aminoacridine (9aa)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'chca',
              'positive',
            ],
            count: 35,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'chca',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 25,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 19,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'nedc',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'chca:dhb',
              'positive',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'dhap',
              'positive',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'zsa',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'zsa',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '9aa',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '9aa',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'bndm',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'bndm',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'norharmane',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'norharmane',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '1,5-diaminonaphthalene (dan)+hcl',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'none',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '9-aa',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '9aa hcl',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              '9aa hcl',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'a07',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'a07',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'dan hcl',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'dan hcl',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'flex matrix',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'fmp-10',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'na',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'a03',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'flexmaldi2',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi',
              'norhamane',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi2',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 78,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi2',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi2',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi2',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi2',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi-2',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex',
              'ap-maldi',
              '2-mercaptobenzothiazole (mbt)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 169,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 76,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 51,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 15,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 28,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '9-aminoacridine (9aa)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 27,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 24,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 22,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'none',
              'negative',
            ],
            count: 14,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'none',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'chca',
              'positive',
            ],
            count: 12,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'nedc dan',
              'negative',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'nedc dan',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '2,3-dicyanohydroquinone',
              'positive',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '2,5-dihydroxy benzoic acid (dhb)',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '2,5-dihydroxy benzoic acid (dhb)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'norharmane',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'norharmane',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'n -naphthylethylenediamine dihydrochloride',
              'negative',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '1,5-diaminonaphthalene (dan)+hcl',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'chca:dhb',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'dan nedc',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'none ',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '1,6-diphenyl-1,3,5-hexatriene',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '9-aa',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              '9aa',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'bpyn',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'dan',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'multiple',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'ndec',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi',
              'zsa',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'desi',
              'none',
              'negative',
            ],
            count: 106,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'desi',
              'none',
              'positive',
            ],
            count: 67,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'desi',
              'none ',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi-2',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi-2',
              'norharmane',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi-2',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi-2',
              '1,5-diaminonaphthalene (dan)+hcl',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi-2',
              'dhb',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'ap-maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'maldi 2',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'c60 (sims)',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof reflector',
              'sims',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 131,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 113,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 113,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 61,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              'chca',
              'positive',
            ],
            count: 59,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              '9aa',
              'negative',
            ],
            count: 29,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              '9aa',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 27,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 26,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              'au',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              'fmp-10',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              'nhm',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7 t fticr',
              'maldi',
              'sdhb',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              'hcca',
              'positive',
            ],
            count: 204,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 27,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 19,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              '2,5-dihydroxybenzoic acid',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              'chca',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              '9-aa',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              'dhap',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'desi',
              'none',
              'negative',
            ],
            count: 23,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'desi',
              'none',
              'positive',
            ],
            count: 21,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'sims',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof',
              'sims (bi3+)',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 56,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 35,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 55,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              'dhb',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 54,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 19,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              'chca',
              'positive',
            ],
            count: 16,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 12,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '15 t fticr',
              'maldi',
              'none',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 58,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 17,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 12,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'norharmane',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'norharmane',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'dhb/chca',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'dpp ',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'chca',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'dan',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi',
              'dpp + norharmane',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'desi',
              'none',
              'negative',
            ],
            count: 78,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'desi',
              'none',
              'positive',
            ],
            count: 22,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'ap-maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'ap-maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'ap-maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qtof',
              'apmaldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi 5',
              'dhb',
              'positive',
            ],
            count: 19,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi 5',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 14,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi 5',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi 5',
              'desi',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi 5',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi5 af',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 13,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi5 af',
              '2,5-dihydroxybenzoic acid (dhb), concentration 30 mg/ml',
              'positive',
            ],
            count: 13,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi5 af',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'desi',
              'none',
              'positive',
            ],
            count: 16,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'desi',
              'none',
              'negative',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'desi',
              'desi',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'desi',
              '2,5-dihydroxybenzoic acid (dhb) (35 mg/ml)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi5',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 25,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi5',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi',
              'chca',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi',
              'au',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 12,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ir-maldesi',
              'none',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ir-maldesi',
              'none',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'orbisims',
              'none',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'orbisims',
              'none',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi 10',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi 10',
              'dhb',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi 10',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'ap-smaldi 10',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'laesi',
              'none',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'deffi',
              'none',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'deffi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'apmaldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'hesi',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'hesi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'irmaldesi',
              'none',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap',
              'nanodesi',
              'n/a',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 139,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 40,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              'norharmane',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              'norharmane',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12t fticr',
              'maldi',
              '9aa',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 47,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 34,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 15,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'dan',
              'negative',
            ],
            count: 15,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '9aa',
              'negative',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '9aa',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '9-aminoacridine (9aa)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'chca',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'chca',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'maldi 2',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '2,6-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              '2,6-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'norharmane',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'flexmaldi-2',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi',
              'flexmaldi2',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 31,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'maldi2',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi2',
              'timstof flex maldi-2',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap xl',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 99,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap xl',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'negative',
            ],
            count: 51,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap xl',
              'maldi',
              'none',
              'negative',
            ],
            count: 14,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap xl',
              'maldi',
              'n/a',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap xl',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap xl',
              'maldi',
              '9-aminoacridine (9aa)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap xl',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap xl',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap xl',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap xl',
              'maldi',
              'dan',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 49,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 25,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 25,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              '9aa',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              '9aa',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              'chca',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr scimax 7t',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12 t fticr',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 35,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12 t fticr',
              'maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12 t fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 25,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12 t fticr',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 20,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12 t fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 16,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12 t fticr',
              'maldi',
              'dan',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12 t fticr',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '12 t fticr',
              'maldi',
              'au',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt xs',
              'desi',
              'none',
              'positive',
            ],
            count: 86,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ap-smaldi5 af',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ap-smaldi5 af',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ap-smaldi5 af',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ap-smaldi5 af',
              'dhb',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ap-smaldi 10',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 18,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ap-smaldi 10',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'maldi',
              'sdhb',
              'positive',
            ],
            count: 11,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ep-maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ep-maldi',
              'n-(1-naphthyl)ethylenediamine dihydrochloride (nedc)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ep-maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ep-maldi',
              '2-mercaptobenzothiazole (mbt)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ep-maldi',
              'dan',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'desi',
              'none',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'desi',
              'none',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'ap-smaldi 5',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'maldi-2',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q-exactive-orbitrap-hf',
              'nano-desi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qexactive plus',
              'ap-smaldi 5',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 64,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qexactive plus',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dhap)',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qexactive plus',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'n/a',
              'maldi',
              'n/a',
              'positive',
            ],
            count: 60,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'n/a',
              'maldi',
              'n/a',
              'negative',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'n/a',
              'maldi',
              'none',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'n/a',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'n/a',
              'desi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt',
              'maldi',
              'none',
              'positive',
            ],
            count: 31,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt',
              'desi',
              'none',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt',
              'desi',
              'none',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 480',
              'ap-smaldi5 af',
              'dhb',
              'positive',
            ],
            count: 14,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 480',
              'ap-smaldi5 af',
              'dhb',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 480',
              'ap-smaldi5 af',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 14,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 480',
              'ap-smaldi5 af',
              'nedc',
              'negative',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 480',
              'ap-smaldi5 af',
              'chca',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 480',
              'ap-smaldi5 af',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 480',
              'ap-smaldi5 af',
              '9-aa',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 480',
              'ap-maldi uhr',
              'dhb',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'exploris 480',
              'ap-maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 45,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'exploris 480',
              'ap-maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'exploris 480',
              'ap-maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'exploris 480',
              'ap-maldi',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'exploris 480',
              'ap maldi',
              'dhb',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'exploris 480',
              'lesa',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7t fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 24,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7t fticr',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7t fticr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7t fticr',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7t fticr',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7t fticr',
              'maldi',
              'chca',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '7t fticr',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf-x',
              'nano-desi',
              'none',
              'positive',
            ],
            count: 20,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf-x',
              'nano-desi',
              'none',
              'negative',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf-x',
              'nanodesi',
              'none',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf-x',
              'ap-smaldi5 af',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf-x',
              'ap-smaldi5 af',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf-x',
              'desi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf-x',
              'desi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf-x',
              'ap-smaldi 10',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt g2-s hdms',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt g2-s hdms',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt g2-s hdms',
              'maldi',
              'chca',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt g2-s hdms',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt g2-s hdms',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt g2-s hdms',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt g2-s hdms',
              'maldi-2',
              '2,5-dihydroxyacetophenone (dha)',
              'negative',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt g2-s hdms',
              'desi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ftms',
              'maldi',
              'α-cyano-4-hydroxycinnamic acid (hcca)',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ftms',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ftms',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ftms',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ftms',
              'maldi',
              'norharmane',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ftms',
              'nano-desi',
              'none',
              'positive',
            ],
            count: 10,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt xs tof',
              'desi',
              'none',
              'positive',
            ],
            count: 24,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'maldi timstof',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 15,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'maldi timstof',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof',
              'maldi',
              '2,5-dihydroxyacetophenone',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof',
              'maldi',
              '2,5-dihydroxyacetophenone',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof',
              'maldi',
              '2,5-dihydroxybenzoic acid',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof',
              'maldi',
              '1,5-diaminonaphthalene',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof',
              'maldi',
              '2,5-dihydroxyacetophenone (dhap)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof',
              'maldi',
              'dhap',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof',
              'maldi',
              'dhb',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'uhmr',
              'maldi',
              'chca',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'uhmr',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 8,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'uhmr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'exactive',
              'desi',
              'none',
              'positive',
            ],
            count: 17,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ft-icr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ft-icr',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ft-icr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ft-icr',
              'maldi',
              'chca',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ft-icr',
              'maldi',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'mrt',
              'desi',
              'none',
              'negative',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'mrt',
              'desi',
              'none',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '21t fticr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '21t fticr',
              'maldi',
              'none',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '21t fticr',
              'nano-desi',
              'none',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '21t fticr',
              'nanodesi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '21t ft-icr',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 9,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '21t ft-icr',
              'maldi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr(solarix)',
              'maldi',
              '2,5-dihydroxybenzoic acid',
              'positive',
            ],
            count: 6,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr(solarix)',
              'maldi',
              '1,5-diaminonaphthalene',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 240',
              'ap-smaldi5 af',
              'dhb',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 240',
              'ap-smaldi5 af',
              'dhb',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 240',
              'ap-smaldi5 af',
              'chca',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 240',
              'ap-smaldi5 af',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'orbitrap exploris 240',
              'ap-smaldi5 af',
              '9-aa',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'xevo g2-xs',
              'desi',
              'none',
              'negative',
            ],
            count: 7,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'xevo g2-xs',
              'desi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi-2',
              'maldi',
              'nrm',
              'negative',
            ],
            count: 5,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof flex maldi-2',
              'maldi',
              'nrm',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'waters vion ims qtof mass spectrometer',
              'desi',
              'none',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'waters vion ims qtof mass spectrometer',
              'desi',
              'none',
              'negative',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr 12t',
              'maldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr 12t',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'fticr 12t',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof ',
              'maldi',
              'dha',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof ',
              'maldi',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'timstof ',
              'maldi',
              '9-aminoacridine (9aa)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'buncher-tof',
              'gcib-sims',
              'none',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'buncher-tof',
              'gcib-sims',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf',
              'ap-smaldi5 af',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 3,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf',
              'ap-smaldi5 af',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive hf',
              'ap-smaldi5 af',
              '9-aminoacridine (9aa)',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'qexactive ',
              'desi',
              'none',
              'negative',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt g2-s ms',
              'desi',
              'none',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'uhmr-orbitrap',
              'maldi',
              '2,5-dihydroxyacetophenone (dha)',
              'positive',
            ],
            count: 4,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '21 t fticr',
              'nano-desi',
              'none',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              '21 t fticr',
              'nano-desi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'bruker timstof flex',
              'maldi',
              'chca',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'bruker timstof flex',
              'maldi',
              'norhamane',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'bruker timstof flex',
              'maldi',
              'norharmane',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'e.g. fticr, orbitrap',
              'laesi',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'e.g. fticr, orbitrap',
              'maldi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ltq orbitrap velos',
              'ap-maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ltq orbitrap velos',
              'ap-maldi',
              'dhb',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'maldi + tof',
              'maldi',
              '1,5-diaminonaphthalene (dan)',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof ',
              'maldi',
              'nedc',
              'negative',
            ],
            count: 2,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'exploris240',
              'apmaldi',
              'alpha-cyano-4-hydroxycinnamic acid (chca)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'ion trap',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'mr tof',
              'desi',
              'none',
              'negative',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'q exactive',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'synapt g2si',
              'maldi',
              '2,5-dihydroxybenzoic acid (dhb)',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
          {
            fieldValues: [
              'tof_',
              'desi',
              'none',
              'positive',
            ],
            count: 1,
            __typename: 'DatasetCountPerGroupListElement',
          },
        ],
        __typename: 'DatasetCountPerGroup',
      },
    }

    // prettier-ignore
    const data_test = [
      { value: [2, 0, 10, 1.0413926851582251], label: { x: 'Other', y: 'NanoDESI' } },
      { value: [7, 0, 10, 1.0413926851582251], label: { x: 'Other', y: 'MALDI-CHCA' } },
      { value: [11, 0, 46, 1.6720978579357175], label: { x: 'Other', y: 'MALDI-N/A' } },
      { value: [19, 0, 2, 0.47712125471966244], label: { x: 'Other', y: 'MALDI-Other' } },
      { value: [0, 1, 14, 1.1760912590556813], label: { x: 'QTOF', y: 'DESI' } },
      { value: [6, 1, 43, 1.6434526764861874], label: { x: 'QTOF', y: 'MALDI-DHB' } },
      { value: [7, 1, 5, 0.7781512503836436], label: { x: 'QTOF', y: 'MALDI-CHCA' } },
      { value: [9, 1, 11, 1.0791812460476249], label: { x: 'QTOF', y: 'MALDI-2,5-DHAP' } },
      { value: [10, 1, 5, 0.7781512503836436], label: { x: 'QTOF', y: 'MALDI-Mix' } },
      { value: [12, 1, 3, 0.6020599913279624], label: { x: 'QTOF', y: 'MALDI-Norharmane' } },
      { value: [13, 1, 1, 0.3010299956639812], label: { x: 'QTOF', y: 'MALDI-NEDC' } },
      { value: [19, 1, 5, 0.7781512503836436], label: { x: 'QTOF', y: 'MALDI-Other' } },
      { value: [0, 2, 13, 1.146128035678238], label: { x: 'TOF', y: 'DESI' } },
      { value: [4, 2, 3, 0.6020599913279624], label: { x: 'TOF', y: 'SIMS' } },
      { value: [6, 2, 56, 1.7558748556724915], label: { x: 'TOF', y: 'MALDI-DHB' } },
      { value: [7, 2, 21, 1.3424226808222062], label: { x: 'TOF', y: 'MALDI-CHCA' } },
      { value: [8, 2, 4, 0.6989700043360189], label: { x: 'TOF', y: 'MALDI-DAN' } },
      { value: [9, 2, 24, 1.3979400086720377], label: { x: 'TOF', y: 'MALDI-2,5-DHAP' } },
      { value: [10, 2, 1, 0.3010299956639812], label: { x: 'TOF', y: 'MALDI-Mix' } },
      { value: [12, 2, 1, 0.3010299956639812], label: { x: 'TOF', y: 'MALDI-Norharmane' } },
      { value: [18, 2, 1, 0.3010299956639812], label: { x: 'TOF', y: 'MALDI-sDHB' } },
      { value: [19, 2, 2, 0.47712125471966244], label: { x: 'TOF', y: 'MALDI-Other' } },
      { value: [0, 3, 180, 2.2576785748691846], label: { x: 'Orbitrap', y: 'DESI' } },
      { value: [1, 3, 196, 2.294466226161593], label: { x: 'Orbitrap', y: 'IR-MALDESI' } },
      { value: [2, 3, 12, 1.1139433523068367], label: { x: 'Orbitrap', y: 'NanoDESI' } },
      { value: [3, 3, 4, 0.6989700043360189], label: { x: 'Orbitrap', y: 'LAESI' } },
      { value: [5, 3, 16, 1.2304489213782739], label: { x: 'Orbitrap', y: 'Other' } },
      { value: [6, 3, 1001, 3.0008677215312267], label: { x: 'Orbitrap', y: 'MALDI-DHB' } },
      { value: [7, 3, 94, 1.9777236052888478], label: { x: 'Orbitrap', y: 'MALDI-CHCA' } },
      { value: [8, 3, 132, 2.123851640967086], label: { x: 'Orbitrap', y: 'MALDI-DAN' } },
      { value: [9, 3, 44, 1.6532125137753437], label: { x: 'Orbitrap', y: 'MALDI-2,5-DHAP' } },
      { value: [10, 3, 38, 1.591064607026499], label: { x: 'Orbitrap', y: 'MALDI-Mix' } },
      { value: [11, 3, 4, 0.6989700043360189], label: { x: 'Orbitrap', y: 'MALDI-N/A' } },
      { value: [12, 3, 10, 1.0413926851582251], label: { x: 'Orbitrap', y: 'MALDI-Norharmane' } },
      { value: [13, 3, 2, 0.47712125471966244], label: { x: 'Orbitrap', y: 'MALDI-NEDC' } },
      { value: [14, 3, 3, 0.6020599913279624], label: { x: 'Orbitrap', y: 'MALDI-9AA' } },
      { value: [15, 3, 4, 0.6989700043360189], label: { x: 'Orbitrap', y: 'MALDI-PNA' } },
      { value: [16, 3, 3, 0.6020599913279624], label: { x: 'Orbitrap', y: 'MALDI-MBT' } },
      { value: [17, 3, 2, 0.47712125471966244], label: { x: 'Orbitrap', y: 'MALDI-CMBT' } },
      { value: [19, 3, 221, 2.346352974450639], label: { x: 'Orbitrap', y: 'MALDI-Other' } },
      { value: [0, 4, 2, 0.47712125471966244], label: { x: 'FTICR', y: 'DESI' } },
      { value: [2, 4, 36, 1.568201724066995], label: { x: 'FTICR', y: 'NanoDESI' } },
      { value: [3, 4, 9, 1.0], label: { x: 'FTICR', y: 'LAESI' } },
      { value: [4, 4, 2, 0.47712125471966244], label: { x: 'FTICR', y: 'SIMS' } },
      { value: [5, 4, 15, 1.2041199826559248], label: { x: 'FTICR', y: 'Other' } },
      { value: [6, 4, 1588, 3.2011238972073794], label: { x: 'FTICR', y: 'MALDI-DHB' } },
      { value: [7, 4, 437, 2.6414741105040997], label: { x: 'FTICR', y: 'MALDI-CHCA' } },
      { value: [8, 4, 26, 1.4313637641589874], label: { x: 'FTICR', y: 'MALDI-DAN' } },
      { value: [9, 4, 47, 1.6812412373755872], label: { x: 'FTICR', y: 'MALDI-2,5-DHAP' } },
      { value: [10, 4, 41, 1.6232492903979006], label: { x: 'FTICR', y: 'MALDI-Mix' } },
      { value: [11, 4, 6, 0.8450980400142568], label: { x: 'FTICR', y: 'MALDI-N/A' } },
      { value: [12, 4, 15, 1.2041199826559248], label: { x: 'FTICR', y: 'MALDI-Norharmane' } },
      { value: [13, 4, 4, 0.6989700043360189], label: { x: 'FTICR', y: 'MALDI-NEDC' } },
      { value: [14, 4, 1, 0.3010299956639812], label: { x: 'FTICR', y: 'MALDI-9AA' } },
      { value: [19, 4, 46, 1.6720978579357175], label: { x: 'FTICR', y: 'MALDI-Other' } },
    ]
    const spectrumChart = ref(null)
    const state = reactive<MassSpecSummaryChartState>({
      scaleIntensity: false,
      size: 600,
      chartOptions: {
        title: {
          text: 'Number of dataset per analyzer/ion source/matrix',
          subtext: 'Positive',
          left: 'center',
          top: 0,
        },
        tooltip: {
          position: 'top',
          formatter: function(params: any) {
            return (
              params.value[2]
              + ' datasets in '
              + params?.data?.label?.x
              + ' of '
              + params?.data?.label?.y
            )
          },
        },
        grid: {
          left: 2,
          bottom: 10,
          right: 10,
          containLabel: true,
        },
        xAxis:
          {
            type: 'category',
            data: matrixes,
            axisLine: {
              show: false,
            },
            axisTick: {
              show: false,
            },
            axisLabel: {
              show: true,
              interval: 0,
              rotate: 90,
              formatter: function(value: any, index: number) {
                return value.replace('MALDI-', '')
              },
            },
            position: 'top',
          },
        yAxis: {
          type: 'category',
          data: analyzers,
          axisLine: {
            show: false,
          },
          axisTick: {
            show: false,
          },
          axisLabel: {
            verticalAlign: 'middle',
            show: true,
            interval: 0,
            fontFamily: 'monospace',
            rich: {
              b: {
                fontFamily: 'monospace',
                fontWeight: 'bold',
              },
              h: {
                fontFamily: 'monospace',
                color: '#fff',
              },
            },

          },
        },
        series:
          {
            type: 'scatter',
            symbolSize: function(val: any) {
              return val[3] * 14
            },
            data: data_test,
            animationDelay: function(idx: number) {
              return idx * 5
            },
            label: {
              show: true,
              formatter: function(param: any) {
                return param.data.value[2]
              },
              minMargin: 10,
              // position: 'top',
              verticalAlign: 'middle'
            },
          }
        ,
      },
    })

    const query =
    gql`query GetMSSetupCounts($filter: DatasetFilter, $query: String) {
      countDatasetsPerGroup(query: {
        fields: [DF_ANALYZER_TYPE, DF_ION_SOURCE, DF_MALDI_MATRIX, DF_POLARITY],
        filter: $filter,
        simpleQuery: $query
      }) {
        counts {
          fieldValues
          count
        }
      }
    }`

    const isSourceMaldi = (sourceType: string) => /maldi/i.test(sourceType)
    const isNA = (val: string) => /^(n\/?a|none|other|\s*)$/i.test(val)
    const MALDI = 'maldi'
    const OTHER_ANALYZER = '(other analyzer)'
    const OTHER_SOURCE = '(other ion source)'
    const OTHER_MATRIX = '(other matrix)'
    const matrixName = (matrix: string) => {
      if (matrix !== OTHER_MATRIX) {
        const match = matrix.replace('_', ' ').match(/\(([A-Z0-9]{2,10})\)/i)
        if (match) {
          return match[1]
        }
      }
      return matrix
    }

    const {
      result: receivedDatasetsResult,
      loading: receivedDatasetsResultLoading,
    } = useQuery<any>(query, {
      filter: Object.assign({ status: 'FINISHED' }, $store.getters.gqlDatasetFilter),
      query: $store.getters.ftsQuery,
    })
    const dataChart = computed(() => receivedDatasetsResult.value != null
      ? receivedDatasetsResult.value.countDatasetsPerGroup : null)

    const getData = () => {
      if (!dataChart.value) {
        return []
      }

      const counts = mock.countDatasetsPerGroup.counts // dataChart.value.counts

      const inverted : any = { positive: 'negative', negative: 'positive' }
      const analyzerCounts : any = {}
      const sourceCounts : any = {}
      const matrixCounts : any = {}

      let normedCounts = counts.map((entry: any) => {
        let [analyzer, source, matrix, polarity] = entry.fieldValues
        if (polarity === 'positive') return

        const isMaldi = isSourceMaldi(source)
        if (isNA(analyzer)) {
          analyzer = OTHER_ANALYZER
        } else {
          analyzerCounts[analyzer] = (analyzerCounts[analyzer] || 0) + entry.count
        }
        if (isNA(source)) {
          source = OTHER_SOURCE
        } else if (!isMaldi) {
          sourceCounts[source] = (sourceCounts[source] || 0) + entry.count
        }
        if (isMaldi) {
          if (isNA(matrix)) {
            matrix = OTHER_MATRIX
          } else {
            matrix = matrixName(matrix)
            matrixCounts[matrix] = (matrixCounts[matrix] || 0) + entry.count
          }
        }
        polarity = String(polarity).toLowerCase()

        return {
          analyzer,
          sourceType: isMaldi ? matrix : source,
          isMaldi,
          polarity,
          count: entry.count,
        }
      })

      // Limit to the top 10 analyzers/sources/matrixes. Change everything else to "Other"
      let topAnalyzers = sortBy(Object.entries(analyzerCounts), 1).map(([key] : any) => key).slice(-10)
      const topSources = sortBy(Object.entries(sourceCounts), 1).map(([key] : any) => key).slice(-6)
      const topMatrixes = sortBy(Object.entries(matrixCounts), 1).map(([key] : any) => key).slice(-10)
      let sources = topSources

      normedCounts = normedCounts.filter((entry: any) => entry)
      normedCounts.forEach((entry: any) => {
        if (!topAnalyzers.includes(entry.analyzer)) {
          entry.analyzer = OTHER_ANALYZER
        }
        if (!entry.isMaldi && !topSources.includes(entry.sourceType)) {
          entry.sourceType = OTHER_SOURCE
        }
        if (entry.isMaldi && !topMatrixes.includes(entry.sourceType)) {
          entry.sourceType = OTHER_MATRIX
        }
      })

      sources.push(OTHER_SOURCE)
      sources = sources.concat(topMatrixes)
      sources.push(OTHER_MATRIX)
      topAnalyzers = [OTHER_ANALYZER].concat(topAnalyzers)

      // Group by analyzer, isMaldi and sourceType. Sum counts by polarity.
      const result : any = []
      normedCounts.forEach(({ analyzer, isMaldi, sourceType, polarity, count } : any) => {
        const datum : any = {
          analyzer,
          isMaldi,
          sourceType,
          counts: {
            [polarity]: count,
            [inverted[polarity]]: 0,
          },
          totalCount: count,
        }
        const existing = result.find((other : any) => ['analyzer', 'isMaldi', 'sourceType'].every(f => other[f] === datum[f]))
        if (existing) {
          ['positive', 'negative'].forEach(pol => { existing.counts[pol] += datum.counts[pol] })
          existing.totalCount += datum.totalCount
        } else {
          result.push(datum)
        }
      })

      const positive = result.map((entry: any) => {
        const idxY = topAnalyzers.findIndex((item: any) => item === entry.analyzer)
        const idxX = sources.findIndex((item: any) => item === entry.sourceType)
        return {
          value: [idxX,
            idxY,
            entry.totalCount, Math.log10(entry.totalCount)],
          label: { x: entry.sourceType, y: entry.analyzer },
        }
      })

      return { items: positive, yAxis: topAnalyzers, xAxis: sources }
    }

    const chartOptions = computed(() => {
      const auxOptions = state.chartOptions
      const chartData : any = getData()

      auxOptions.series.data = chartData?.items
      auxOptions.xAxis.data = chartData?.xAxis
      auxOptions.yAxis.data = chartData?.yAxis

      state.size = chartData?.yAxis?.length < 7 ? 800 : chartData?.yAxis?.length * 100

      return auxOptions
    })

    const handleChartResize = () => {
      if (spectrumChart && spectrumChart.value) {
        // @ts-ignore
        spectrumChart.value.chart.resize()
      }
    }

    onMounted(() => {
      window.addEventListener('resize', handleChartResize)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', handleChartResize)
    })

    const handleZoomReset = () => {
      if (spectrumChart && spectrumChart.value) {
        // @ts-ignore
        spectrumChart.value.chart.dispatchAction({
          type: 'dataZoom',
          start: 0,
          end: 100,
        })
      }
    }

    const handleChartRendered = () => {
      const chartRef : any = spectrumChart.value
      if (
        chartRef
        && chartRef.chart
        && chartOptions.value?.xAxis?.data?.length > 0
      ) {
        const auxOptions : any = chartOptions.value
        if (auxOptions) {
          setTimeout(() => {
            const markArea : any = { silent: true, data: [] }
            auxOptions.series.data.forEach((item: any, idx: number) => {
              if (item.value[0] === 0) {
                const [chartX, chartY] = chartRef.convertToPixel({ seriesIndex: 0 }, [item.value[0], item.value[1]])
                const re = /(.+)\s-agg-\s(.+)/
                const label = item.label.x
                const cat = label.replace(re, '$1')
                console.log('chartX, chartY', idx, item, chartX, chartY)
              }
            })
          }, 2000)
        }
      }
    }


    const handleItemSelect = (item: any) => {
      if (item.targetType === 'axisName') {
        state.scaleIntensity = !state.scaleIntensity
      } else {
        emit('itemSelected', item.data.mz)
      }
    }

    const renderSpectrum = () => {
      const { isLoading, isDataLoading } = props

      return (
        <div class='chart-holder'>
          {
            !(isLoading || isDataLoading)
            && props.annotatedLabel
            && <div class='annotated-legend'>{props.annotatedLabel}</div>
          }
          {
            (isLoading || isDataLoading)
            && <div class='loader-holder'>
              <div>
                <i
                  class="el-icon-loading"
                />
              </div>
            </div>
          }
          <ECharts
            ref={spectrumChart}
            autoResize={true}
            {...{
              on: {
                'zr:dblclick': handleZoomReset,
                click: handleItemSelect,
                rendered: handleChartRendered,
              },
            }}
            class='chart'
            style={{ height: `${state.size}px` }}
            options={chartOptions.value}/>
        </div>
      )
    }

    return () => {
      const { isEmpty, isLoading } = props

      return (
        <div class='mass-spec-chart'>
          {
            (!isEmpty || isLoading)
            && renderSpectrum()
          }
          {renderSpectrum()}
        </div>
      )
    }
  },
})
