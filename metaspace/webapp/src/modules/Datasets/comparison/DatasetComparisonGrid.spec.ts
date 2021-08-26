import { mount } from '@vue/test-utils'
import Vue from 'vue'
import { DatasetComparisonGrid } from './DatasetComparisonGrid'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import store from '../../../store'
import router from '../../../router'

// Mock loadPngFromUrl to prevent network requests, but keep the rest of ionImageRendering as it's actually used
jest.mock('../../../lib/ionImageRendering', () => Object.assign(
  {},
  jest.requireActual('../../../lib/ionImageRendering'),
  { loadPngFromUrl: jest.fn() },
))

describe('DatasetComparisonGrid', () => {
  const datasets = [
    {
      id: '2021-04-14_07h23m35s',
      submitter: {
        id: '039801c8-919e-11eb-908e-3b2b8e672707',
        name: 'John Doe',
        email: null,
      },
      principalInvestigator: {
        name: 'Jhon Doe',
        email: null,
      },
      group: null,
      groupApproved: false,
      projects: [
        {
          id: 'b738905e-9229-11eb-8e15-4fc9140611d2',
          name: 'New Test',
        },
        {
          id: '05c6519a-8049-11eb-927e-6bf28a9b25ae',
          name: 'Test',
        },
        {
          id: '717123c8-9d0b-11eb-a675-eb973178fad8',
          name: 'Teste antigo',
        },
      ],
      name: 'New test create',
      polarity: 'POSITIVE',
      metadataJson: '{"Data_Type":"Imaging MS","Sample_Information":'
      + '{"Condition":"wild","Organism":"Fish","Organism_Part":"tail",'
      + '"Sample_Growth_Conditions":""},"Sample_Preparation":'
      + '{"MALDI_Matrix":"none","Tissue_Modification":"chemical",'
      + '"Sample_Stabilisation":"water","MALDI_Matrix_Application":'
      + '"none","Solvent":"none"},"MS_Analysis":{"Polarity":"Positive"'
      + ',"Ionisation_Source":"MALDI","Analyzer":"Orbittrap",'
      + '"Detector_Resolving_Power":{"Resolving_Power":140000,"mz":200},"'
      + 'Pixel_Size":{"Xaxis":12,"Yaxis":12}},"Additional_Information":{"Supplementary":""}}',
      isPublic: true,
      opticalImages: [],
    },
    {
      id: '2021-03-31_08h41m01s',
      submitter: {
        id: '19cd5e98-919e-11eb-a246-03c68134260b',
        name: 'Zed Doe',
        email: null,
      },
      principalInvestigator: {
        name: 'ZEDX',
        email: null,
      },
      group: null,
      groupApproved: false,
      projects: [
        {
          id: '05c6519a-8049-11eb-927e-6bf28a9b25ae',
          name: 'Test',
        },
      ],
      name: 'New 2',
      polarity: 'POSITIVE',
      metadataJson: '{"Data_Type":"Imaging MS","Sample_Information":'
      + '{"Condition":"wild","Organism":"Fish","Organism_Part":"tail",'
      + '"Sample_Growth_Conditions":""},"Sample_Preparation":'
      + '{"MALDI_Matrix":"none","Tissue_Modification":"chemical",'
      + '"Sample_Stabilisation":"water","MALDI_Matrix_Application":'
      + '"none","Solvent":"none"},"MS_Analysis":{"Polarity":"Positive"'
      + ',"Ionisation_Source":"MALDI","Analyzer":"Orbittrap",'
      + '"Detector_Resolving_Power":{"Resolving_Power":140000,"mz":200},"'
      + 'Pixel_Size":{"Xaxis":12,"Yaxis":12}},"Additional_Information":{"Supplementary":""}}',
      isPublic: true,
      opticalImages: [],
    },
  ]
  const propsData = {
    nCols: 2,
    nRows: 1,
    settings: {
      value: {
        snapshot: '{"nCols":2,"nRows":1,"grid":{"0-0":"2021-04-14_07h23m35s","0-1":"2021-03-31_08h41m01s"}}',
      },
    },
    selectedAnnotation: 0,
    datasets,
    annotations: [
      {
        ion: 'c10h11no+na+',
        dbId: '1',
        datasetIds: [
          '2021-03-31_08h41m01s',
          '2021-04-14_07h23m35s',
        ],
        annotations: [
          {
            id: '2021-03-31_08h41m01s_4580',
            sumFormula: 'C10H11NO',
            adduct: '+Na',
            ion: 'C10H11NO+Na+',
            ionFormula: 'C10H11NONa',
            database: 'HMDB',
            msmScore: 0.736404,
            rhoSpatial: 0.848534,
            rhoSpectral: 0.982476,
            rhoChaos: 0.883333,
            fdrLevel: 0.05,
            mz: 184.07324581966384,
            colocalizationCoeff: null,
            offSample: null,
            offSampleProb: null,
            dataset: datasets[1],
            databaseDetails: {
              id: 1,
            },
            isotopeImages: [
              {
                mz: 184.07324581966384,
                url: 'http://storage:9000/sm-ion-images-dev/iso/2021-03-31_08h41m01s/215b3c0fdaf641c6b80fe5b8987765a2',
                minIntensity: 35164060,
                maxIntensity: 66406896,
                totalIntensity: 397446848,
              },
              {
                mz: 185.07033678951265,
                url: null,
                minIntensity: 0,
                maxIntensity: 0,
                totalIntensity: 0,
              },
              {
                mz: 185.07666674619,
                url: 'http://storage:9000/sm-ion-images-dev/iso/2021-03-31_08h41m01s/24e86c05be194304bbb01c665a8d8ba0',
                minIntensity: 1950966.5,
                maxIntensity: 3037184.25,
                totalIntensity: 20536518,
              },
              {
                mz: 186.07983597651875,
                url: null,
                minIntensity: 0,
                maxIntensity: 0,
                totalIntensity: 0,
              },
            ],
            isomers: [],
            isobars: [
              {
                ion: 'C7H15NO2+K+',
                ionFormula: 'C7H15NO2K',
                peakNs: [
                  [
                    1,
                    1,
                  ],
                  [
                    3,
                    2,
                  ],
                ],
                shouldWarn: true,
              },
            ],
            countPossibleCompounds: 5,
            possibleCompounds: [
              {
                name: '3,4-Dihydro-4-[(5-methyl-2-furanyl)methylene]-2H-pyrrole',
                imageURL: '/mol-images/HMDB/HMDB0040048.svg',
                information: [
                  {
                    database: 'HMDB',
                    url: 'nullHMDB0040048',
                  },
                ],
              },
              {
                name: '3-[(5-Methyl-2-furanyl)methyl]-1H-pyrrole',
                imageURL: '/mol-images/HMDB/HMDB0040042.svg',
                information: [
                  {
                    database: 'HMDB',
                    url: 'nullHMDB0040042',
                  },
                ],
              },
              {
                name: '1-(2,3-Dihydro-1H-pyrrolizin-5-yl)-2-propen-1-one',
                imageURL: '/mol-images/HMDB/HMDB0040028.svg',
                information: [
                  {
                    database: 'HMDB',
                    url: 'nullHMDB0040028',
                  },
                ],
              },
              {
                name: '(R)-Boschniakine',
                imageURL: '/mol-images/HMDB/HMDB0030267.svg',
                information: [
                  {
                    database: 'HMDB',
                    url: 'nullHMDB0030267',
                  },
                ],
                __typename: 'Compound',
              },
              {
                name: 'Tryptophanol',
                imageURL: '/mol-images/HMDB/HMDB0003447.svg',
                information: [
                  {
                    database: 'HMDB',
                    url: 'nullHMDB0003447',
                  },
                ],
              },
            ],
          },
          {
            id: '2021-04-14_07h23m35s_16007',
            sumFormula: 'C10H11NO',
            adduct: '+Na',
            ion: 'C10H11NO+Na+',
            ionFormula: 'C10H11NONa',
            database: 'HMDB',
            msmScore: 0.736404,
            rhoSpatial: 0.848534,
            rhoSpectral: 0.982476,
            rhoChaos: 0.883333,
            fdrLevel: 0.05,
            mz: 184.07324581966384,
            colocalizationCoeff: null,
            offSample: null,
            offSampleProb: null,
            dataset: datasets[0],
            databaseDetails: {
              id: 1,
            },
            isotopeImages: [
              {
                mz: 184.07324581966384,
                url: 'http://storage:9000/sm-ion-images-dev/iso/2021-04-14_07h23m35s/3768327e8301478a95e3b8424caa4b33',
                minIntensity: 35164060,
                maxIntensity: 66406896,
                totalIntensity: 397446848,
              },
              {
                mz: 185.07033678951265,
                url: null,
                minIntensity: 0,
                maxIntensity: 0,
                totalIntensity: 0,
              },
              {
                mz: 185.07666674619,
                url: 'http://storage:9000/sm-ion-images-dev/iso/2021-04-14_07h23m35s/747668413b4b4274b08e78019692aa01',
                minIntensity: 1950966.5,
                maxIntensity: 3037184.25,
                totalIntensity: 20536518,
              },
              {
                mz: 186.07983597651875,
                url: null,
                minIntensity: 0,
                maxIntensity: 0,
                totalIntensity: 0,
              },
            ],
            isomers: [],
            isobars: [
              {
                ion: 'C7H15NO2+K+',
                ionFormula: 'C7H15NO2K',
                peakNs: [
                  [
                    1,
                    1,
                  ],
                  [
                    3,
                    2,
                  ],
                ],
                shouldWarn: true,
              },
            ],
            countPossibleCompounds: 5,
            possibleCompounds: [
              {
                name: '3,4-Dihydro-4-[(5-methyl-2-furanyl)methylene]-2H-pyrrole',
                imageURL: '/mol-images/HMDB/HMDB0040048.svg',
                information: [
                  {
                    database: 'HMDB',
                    url: 'nullHMDB0040048',
                  },
                ],
              },
              {
                name: '3-[(5-Methyl-2-furanyl)methyl]-1H-pyrrole',
                imageURL: '/mol-images/HMDB/HMDB0040042.svg',
                information: [
                  {
                    database: 'HMDB',
                    url: 'nullHMDB0040042',
                  },
                ],
              },
              {
                name: '1-(2,3-Dihydro-1H-pyrrolizin-5-yl)-2-propen-1-one',
                imageURL: '/mol-images/HMDB/HMDB0040028.svg',
                information: [
                  {
                    database: 'HMDB',
                    url: 'nullHMDB0040028',
                  },
                ],
              },
              {
                name: '(R)-Boschniakine',
                imageURL: '/mol-images/HMDB/HMDB0030267.svg',
                information: [
                  {
                    database: 'HMDB',
                    url: 'nullHMDB0030267',
                  },
                ],
              },
              {
                name: 'Tryptophanol',
                imageURL: '/mol-images/HMDB/HMDB0003447.svg',
                information: [
                  {
                    database: 'HMDB',
                    url: 'nullHMDB0003447',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    isLoading: false,
  }

  const testHarness = Vue.extend({
    components: {
      DatasetComparisonGrid,
    },
    render(h) {
      return h(DatasetComparisonGrid, { props: this.$attrs })
    },
  })

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
  })

  it('it should match snapshot', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()
    expect(wrapper.element).toMatchSnapshot()
  })

  it('it should match the number of cols and rows passed via props', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper.findAll('.dataset-comparison-grid-row').length)
      .toBe(propsData.nRows)
    expect(wrapper.findAll('.dataset-comparison-grid-col').length)
      .toBe(propsData.nCols)
  })
})
