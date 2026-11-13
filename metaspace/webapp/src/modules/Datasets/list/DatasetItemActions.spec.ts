import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { DefaultApolloClient } from '@vue/apollo-composable'
import DatasetItemActions from './DatasetItemActions'
import router from '../../../router'
import store from '../../../store'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'

describe('DatasetItemActions', () => {
  const baseDataset = {
    id: 'mockdataset',
    name: 'Mock dataset',
    status: 'FINISHED',
    projects: [],
    submitter: { id: 'submitter' },
    canEdit: false,
    canDelete: false,
    canDownload: true,
  }

  const mountActions = async (dataset: any) => {
    const client = await initMockGraphqlClient({ Query: () => ({}) })
    const wrapper = mount(DatasetItemActions, {
      global: { plugins: [router, store], provide: { [DefaultApolloClient]: client } },
      props: { dataset, metadata: {}, currentUser: { id: 'someone' } },
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  // router-link is stubbed in tests, so the Edit entry is found by its text.
  const editLinks = (wrapper: any) =>
    wrapper.findAll('div').filter((el: any) => el.text() === 'Edit' && el.element.children.length === 0)

  it('shows the Edit link for a sponsored editor who cannot otherwise edit', async () => {
    const wrapper = await mountActions({ ...baseDataset, editAccessMode: 'SPONSORED' })
    expect(editLinks(wrapper).length).toBe(1)
  })

  it('hides the Edit link when editAccessMode is null', async () => {
    const wrapper = await mountActions({ ...baseDataset, canEdit: true, editAccessMode: null })
    expect(editLinks(wrapper).length).toBe(0)
  })
})
