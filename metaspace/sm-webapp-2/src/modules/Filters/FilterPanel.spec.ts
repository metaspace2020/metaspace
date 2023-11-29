import {flushPromises, mount} from '@vue/test-utils';
import FilterPanel from './FilterPanel.vue';
import {nextTick} from "vue";
import store from "../../store";

import {
  mockMolecularDatabases,
  mockAdductSuggestions,
  mockDatasetDatabases,
} from "@/tests/utils/mockGraphqlData";
import  {initMockGraphqlClient} from "@/tests/utils/mockGraphqlClient";
import { DefaultApolloClient } from '@vue/apollo-composable';
import {vi} from "vitest";
import router from "@/router";
import {encodeParams} from "@/modules/Filters/url";


vi.mock('../../lib/util', () => ({
  getJWT: vi.fn().mockResolvedValue({text: vi.fn()}), // Mock getJWT to return a resolved promise with a string
}));

// const router = createRouter({
//   history: createWebHistory(),
//   routes: [], // Define your routes here
// });

let graphqlMockClient: any


describe('FilterPanel', () => {
  const allFilters = {
    database: 1,
    group: '0123',
    project: '4567',
    submitter: '89AB',
    datasetIds: ['CDEF', 'GHIJ'],
    minMSM: 0.5,
    compoundName: 'C8H20NO6P',
    adduct: '+K',
    mz: 296.0659,
    fdrLevel: 0.1,
    polarity: 'Positive',
    organism: 'cow',
    organismPart: 'stomach',
    condition: 'hungry',
    growthConditions: 'paddock',
    ionisationSource: 'MALDI',
    maldiMatrix: 'DHB',
    analyzerType: 'FTICR',
    simpleQuery: 'foo',
    metadataType: 'ims',
  }

  beforeEach(async() => {
    graphqlMockClient = await initMockGraphqlClient({
      Query: () => ({
        adductSuggestions: mockAdductSuggestions,
        allMolecularDBs: mockMolecularDatabases,
        allDatasets: mockDatasetDatabases,
      }),
    })
    store.commit('setFilterLists', null)
    await store.dispatch('initFilterLists', graphqlMockClient)
  })

  const updateFilter = async(newFilter: any) => {
    await router.replace({ path: '/annotations' })
    await nextTick()
    await store.commit('updateFilter', newFilter)
    await nextTick() // Must wait after every change for vue-router to update the store
  }


  it('should match snapshot (no filters)', async ({expect}) => {
    await updateFilter({})
    const propsData = { level: 'annotation' }
    const wrapper = mount(FilterPanel, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: propsData
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  });

  it('should match snapshot (database without dataset)', async ({expect}) => {
    await updateFilter({ database: allFilters.database })
    const propsData = { level: 'annotation' }
    const wrapper = mount(FilterPanel, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: propsData
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  });

  it('should match snapshot (all annotation filters)', async({expect}) => {
    await updateFilter(allFilters)
    const propsData = { level: 'annotation' }
    const wrapper = mount(FilterPanel, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: propsData
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  });


  it('should update the route when filters change', async({expect}) => {
    await updateFilter(allFilters)
    const propsData = { level: 'annotation' }
    const wrapper = mount(FilterPanel, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: propsData
    });
    const newFilters = {
      simpleQuery: 'lorem ipsum',
      // database: 2,
      // project: 'abc',
      // datasetIds: ['aaa', 'bbb'],
      // compoundName: 'C10H15N3O5',
      // mz: '296.1',
    }

    // await flushPromises();
    // await nextTick();

    // simpleQuery - SearchBox
    await wrapper.find('[data-test-key="simpleQuery"]').setValue(newFilters.simpleQuery);
    // database - SingleSelectFilter
    // await wrapper.find('[data-test-key="database"]').trigger('change', newFilters.database);
    // project - SearchableFilter [multiple=false]
    // wrapper.find('[data-test-key="project"]').trigger('change', newFilters.project);
    // datasetIds - SearchableFilter [multiple=true]
    // wrapper.find('[data-test-key="datasetIds"]').trigger('change', newFilters.datasetIds);
    // compoundName - InputFilter [commented out as does not work with debounce]
    // wrapper.find('[data-test-key="compoundName"] .tf-value-span').trigger('click')
    // await Vue.nextTick()
    // wrapper.find('[data-test-key="compoundName"] input').setValue(newFilters.compoundName)
    // await Vue.nextTick()
    // mz - NumberFilter

    // wrapper.find('[data-test-key="mz"]').trigger('click');
    // wrapper.find('[data-test-key="mz"] input').setValue(newFilters.mz);
    // wrapper.find('[data-test-key="mz"] input').trigger('change');
    await nextTick();
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual(expect.objectContaining(encodeParams(newFilters)));
  });


});
