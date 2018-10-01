import { mount } from '@vue/test-utils';
import Vue from 'vue';
import FilterPanel from './FilterPanel.vue';
import router from '../../router';
import { initMockGraphqlClient, provide } from '../../../tests/utils/mockGraphqlClient';
import Vuex from 'vuex';
import store from '../../store/index';
import { sync } from 'vuex-router-sync';
import { encodeParams } from './url';


Vue.use(Vuex);
sync(store, router);

describe('FilterPanel', () => {
  const allFilters = {
    database: 'HMDBv4',
    group: '0123',
    project: '4567',
    submitter: '89AB',
    datasetIds: ['CDEF','GHIJ'],
    minMSM: 0.5,
    compoundName: 'C8H20NO6P',
    adduct: '+K',
    mz: "296.0659",
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
    metadataType: 'ims'
  };

  beforeEach(() => {
    initMockGraphqlClient();
  });

  it('should match snapshot (no filters)', async () => {
    router.replace({ path: '/annotations' });
    store.commit('updateFilter', {});
    const propsData = { level: 'annotation' };
    const wrapper = mount(FilterPanel, { router, provide, store, propsData, sync: false });
    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
  });

  it('should match snapshot (all annotation filters)', async () => {
    router.replace({ path: '/annotations' });
    store.commit('updateFilter', allFilters);
    const propsData = { level: 'annotation' };
    const wrapper = mount(FilterPanel, { router, provide, store, propsData, sync: false });
    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
  });

  it('should update the route when filters change', async () => {
    router.replace({ path: '/annotations' });
    store.commit('updateFilter', allFilters);
    const propsData = { level: 'annotation' };
    const wrapper = mount(FilterPanel, { router, provide, store, propsData, sync: false });
    const newFilters = {
      simpleQuery: 'lorem ipsum',
      database: 'CHEBI',
      project: 'abc',
      datasetIds: ['aaa','bbb'],
      minMSM: "0.1",
      mz: "296.1"
    };
    await Vue.nextTick();

    // simpleQuery - SearchBox
    wrapper.find('[data-test-key="simpleQuery"] input').setValue(newFilters.simpleQuery);
    // database - SingleSelectFilter
    wrapper.find('[data-test-key="database"] mock-el-select').vm.$emit('change', newFilters.database);
    // project - SearchableFilter [multiple=false]
    wrapper.find('[data-test-key="project"] mock-el-select').vm.$emit('change', newFilters.project);
    // datasetIds - SearchableFilter [multiple=true]
    wrapper.find('[data-test-key="datasetIds"] mock-el-select').vm.$emit('change', newFilters.datasetIds);
    // minMSM - InputFilter
    wrapper.find('[data-test-key="minMSM"] .tf-value-span').trigger('click');
    await Vue.nextTick();
    wrapper.find('[data-test-key="minMSM"] input').setValue(newFilters.minMSM);
    // mz - MzFilter
    wrapper.find('[data-test-key="mz"] .tf-value-span').trigger('click');
    await Vue.nextTick();
    wrapper.find('[data-test-key="mz"] input').setValue(newFilters.mz);
    await Vue.nextTick();

    expect(router.currentRoute.query).toEqual(expect.objectContaining(encodeParams(newFilters)));
  });

  it('should be able to add a filter', async () => {
    router.replace({ path: '/annotations' });
    store.commit('updateFilter', {});
    const propsData = { level: 'annotation' };
    const wrapper = mount(FilterPanel, { router, provide, store, propsData, sync: false });
    await Vue.nextTick();
    expect(wrapper.find('[data-test-key="project"]').exists()).toEqual(false);

    wrapper.find('mock-el-select').vm.$emit('change', 'project');
    await Vue.nextTick();

    expect(wrapper.find('[data-test-key="project"]').exists()).toEqual(true);
  });

  it('should be able to remove a filter', async () => {
    router.replace({ path: '/annotations' });
    store.commit('updateFilter', allFilters);
    const propsData = { level: 'annotation' };
    const wrapper = mount(FilterPanel, { router, provide, store, propsData, sync: false });
    await Vue.nextTick();
    expect(wrapper.find('[data-test-key="project"]').exists()).toEqual(true);

    wrapper.find('[data-test-key="project"] .tf-remove').trigger('click');
    await Vue.nextTick();

    expect(wrapper.find('[data-test-key="project"]').exists()).toEqual(false);
  });
});
