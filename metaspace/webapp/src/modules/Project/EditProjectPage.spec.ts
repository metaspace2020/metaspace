import { mount } from '@vue/test-utils';
import Vue from 'vue';
import EditProjectPage from './EditProjectPage.vue';
import router from '../../router';
import { EditProjectQuery } from '../../api/project';



describe('EditProjectPage', () => {

  const currentUser = {id:'1', role:'user'};
  const mockProject: EditProjectQuery = {
    id: '2',
    name: 'Adduct Assessment Alliance',
    isPublic: true,
    currentUserRole: 'MANAGER',
    members: [
      {
        role: 'MANAGER',
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
          name: 'Project member',
          email: 'person@embl.de'
        }
      }
    ]
  };

  router.replace({ name: 'edit-project', params: { projectId: mockProject.id } });

  it('should match snapshot', async () => {
    const wrapper = mount(EditProjectPage, { router, sync: false });
    wrapper.setData({
      currentUser,
      project: mockProject
    });

    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
  });
});
