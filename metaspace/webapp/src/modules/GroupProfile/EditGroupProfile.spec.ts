import { mount } from '@vue/test-utils';
import Vue from 'vue';
import EditGroupProfile from './EditGroupProfile.vue';
import router from '../../router';
import { EditGroupQuery } from '../../api/group';


describe('EditGroupProfile', () => {

  const currentUser = {id:'1', role:'user'};
  const mockGroup: EditGroupQuery = {
    id: '2',
    name: 'European Molecular Biology Laboratory',
    shortName: 'EMBL',
    currentUserRole: 'PRINCIPAL_INVESTIGATOR',
    members: [
      {
        role: 'PRINCIPAL_INVESTIGATOR',
        numDatasets: 123,
        user: {
          id: '3',
          name: 'me',
          email: 'my-email@example.com'
        }
      },
      {
        role: 'PENDING',
        numDatasets: 0,
        user: {
          id: '4',
          name: 'Person who asked to join',
          email: 'access@requestor.com'
        }
      },
      {
        role: 'INVITED',
        numDatasets: 0,
        user: {
          id: '5',
          name: 'Invitee',
          email: 'awaiting@response.com'
        }
      },
      {
        role: 'MEMBER',
        numDatasets: 1,
        user: {
          id: '6',
          name: 'Group member',
          email: 'person@embl.de'
        }
      }
    ]
  };

  router.replace({ name: 'edit-group', params: { groupId: mockGroup.id } });

  it('should match snapshot', async () => {
    const wrapper = mount(EditGroupProfile, { router, sync: false });
    wrapper.setData({
      currentUser,
      group: mockGroup
    });

    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
  });
});
