import { mount } from '@vue/test-utils'
import Vue from 'vue'
import Vuex from 'vuex'
import router from '../../../router'
import store from '../../../store'
import { sync } from 'vuex-router-sync'
import DatasetItem from './DatasetItem.vue'
import { mockGenerateId, resetGenerateId } from '../../../../tests/utils/mockGenerateId'

Vue.use(Vuex)
sync(store, router)


describe('DatasetItem', () => {
  const user = { id: 'user' }
  const submitter = { id: 'submitter' }
  const admin = { id: 'admin', role: 'admin' }
  const dataset = {
    id: 'mockdataset',
    status: 'FINISHED',
    metadataJson: JSON.stringify({
      Metadata_Type: 'Imaging MS',
      MS_Analysis: {
        Detector_Resolving_Power: { mz: 1234, Resolving_Power: 123456 },
      },
    }),
    configJson: JSON.stringify({
      fdr: { scoring_model: null },
    }),
    databases: [
      { name: 'CHEBI', id: 2 },
      { name: 'HMDB-v2.5', id: 6 },
      { name: 'HMDB-v4', id: 22 },
    ],
    polarity: 'POSITIVE',
    fdrCounts: {
      databaseId: 6,
      dbName: 'HMDB-v2.5',
      levels: [10],
      counts: [20],
    },
    groupApproved: true,
    submitter,
    organism: 'organism',
    organismPart: 'organismPart',
    condition: 'condition',
    analyzer: {
      type: 'type'
    },
    projects: [],
    canEdit: true,
    canDelete: true,
    uploadDT: '2020-04-17T11:37:50.318667',
  }
  const unpublished = { name: 'project', publicationStatus: 'UNPUBLISHED' }
  const underReview = { name: 'project', publicationStatus: 'UNDER_REVIEW' }
  const published = { name: 'project', publicationStatus: 'PUBLISHED' }

  beforeEach(() => {
    resetGenerateId()
  })

  it('should match snapshot', () => {
    mockGenerateId(123)
    const propsData = {
      currentUser: submitter,
      dataset,
    }
    const wrapper = mount(DatasetItem, { parentComponent: { store, router }, propsData })
    expect(wrapper.element).toMatchSnapshot()
  })

  // NOTE: delete changed to dataset overview page (to be removed)
  // it('should be able to delete if unpublished', () => {
  //   const propsData = {
  //     currentUser: submitter,
  //     dataset: {
  //       ...dataset,
  //       projects: [unpublished]
  //     },
  //   }
  //   const wrapper = mount(DatasetItem, { parentComponent: { store, router }, propsData })
  //   expect(wrapper.find('.ds-delete').exists()).toBe(true)
  // })

  it('should not show the publication status if cannot edit', () => {
    const propsData = {
      currentUser: user,
      dataset: {
        ...dataset,
        canEdit: false,
        projects: [published]
      },
    }
    const wrapper = mount(DatasetItem, { parentComponent: { store, router }, propsData })
    expect(wrapper.find('.test-publication-status').exists()).toBe(false)
  })

  it('should not show the publication status if processing', () => {
    const propsData = {
      currentUser: submitter,
      dataset: {
        ...dataset,
        projects: [published],
        status: 'ANNOTATING'
      }
    }
    const wrapper = mount(DatasetItem, { parentComponent: { store, router }, propsData })
    expect(wrapper.find('.test-publication-status').exists()).toBe(false)
  })

  it('should show "Under review" status', () => {
    const propsData = {
      currentUser: submitter,
      dataset: {
        ...dataset,
        projects: [underReview]
      }
    }
    const wrapper = mount(DatasetItem, { parentComponent: { store, router }, propsData })
    expect(wrapper.find('.test-publication-status').text()).toBe('Under review')
  })

  it('should show "Published" status', () => {
    const propsData = {
      currentUser: submitter,
      dataset: {
        ...dataset,
        projects: [published]
      }
    }
    const wrapper = mount(DatasetItem, { parentComponent: { store, router }, propsData })
    expect(wrapper.find('.test-publication-status').text()).toBe('Published')
  })

  it('should prefer "Published" status', () => {
    const propsData = {
      currentUser: submitter,
      dataset: {
        ...dataset,
        projects: [published, underReview]
      }
    }
    const wrapper = mount(DatasetItem, { parentComponent: { store, router }, propsData })
    expect(wrapper.find('.test-publication-status').text()).toBe('Published')
  })

  // NOTE: options changed to dataset overview page (to be removed)
  // it('should show admin options', () => {
  //   const propsData = {
  //     currentUser: admin,
  //     dataset: {
  //       ...dataset,
  //       projects: [published]
  //     }
  //   }
  //   const wrapper = mount(DatasetItem, { parentComponent: { store, router }, propsData })
  //   expect(wrapper.find('.ds-delete').exists()).toBe(true)
  //   expect(wrapper.find('.ds-reprocess').exists()).toBe(true)
  // })
})
