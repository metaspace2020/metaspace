import { mount, Stubs, Wrapper } from '@vue/test-utils'
import { Button, Checkbox } from '../../lib/element-ui'
import Vue from 'vue'
import TransferDatasetsDialog from './TransferDatasetsDialog.vue'
import router from '../../router'

describe('TransferDatasetsDialog', () => {
  const mockDatasets = [
    { id: '2018-06-28_13h23m10s', name: 'Untreated_3_434', uploadDT: '2018-06-28T13:23:10.837000' },
    { id: '2018-06-28_13h21m36s', name: 'Dataset 2', uploadDT: '2018-06-28T13:21:36.973867' },
    { id: '2018-06-28_12h03m36s', name: 'Dataset 3', uploadDT: '2018-06-28T12:03:36.409743' },
    { id: '2018-06-28_13h20m44s', name: 'Dataset 4', uploadDT: '2018-06-28T13:20:44.736472' },
  ]
  const mockProps = {
    currentUserId: 'current user id',
    groupName: 'Group Name',
    isInvited: true,
  }
  const stubs: Stubs = {
    DatasetItem: true,
  };
  [false, true].forEach(hasDatasets => {
    [false, true].forEach(isInvited => {
      it('should match snapshot ('
        + `${hasDatasets ? 'datasets to import' : 'no datasets'}, `
        + `${isInvited ? 'invited' : 'requesting access'})`, () => {
        const propsData = { ...mockProps, isInvited }
        const wrapper = mount(TransferDatasetsDialog, { router, propsData, stubs })
        wrapper.setData({ allDatasets: hasDatasets ? mockDatasets : [] })

        expect(wrapper).toMatchSnapshot()
      })
    })
  })

  it('should call back on success when some datasets are selected', async() => {
    const wrapper = mount(TransferDatasetsDialog, { router, propsData: mockProps, stubs })
    wrapper.setData({ allDatasets: mockDatasets })
    await Vue.nextTick()

    wrapper.findComponent(Checkbox).trigger('click')
    wrapper.findAllComponents<Button>(Button)
      .filter((b: Wrapper<Button>) => b.props().type === 'primary')
      .at(0)
      .trigger('click')
    await Vue.nextTick()

    expect(wrapper.emitted('accept')).toEqual([
      [mockDatasets.slice(1).map(ds => ds.id)],
    ])
  })
})
