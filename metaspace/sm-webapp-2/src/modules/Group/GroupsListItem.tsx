import { defineComponent, computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import { countGroupDatasets, UserGroupRoleOptions } from '../../api/group';
import { plural } from '../../lib/vueFilters';
import {  RouterLink } from 'vue-router';
import { encodeParams } from '../Filters';
import CopyButton from '../../components/CopyButton.vue';
import {ElIcon} from "element-plus";
import { PictureFilled, EditPen} from "@element-plus/icons-vue";
import './GroupsListItem.scss'

interface GroupListItemProps {
  id: string;
  name: string;
  shortName: string;
  currentUserRole: string;
  urlSlug: string;
  numMembers: number;
}

export default defineComponent<GroupListItemProps>({
  name: 'GroupsListItem',
  props: {
    id: String,
    name: String,
    shortName: String,
    urlSlug: String,
    currentUserRole: String,
    numMembers: Number,
  },
  setup(props) {
    const queryVars = computed(() => ({
      groupId: props.id,
    }));

    const { result: countDatasetsResult } = useQuery(countGroupDatasets, queryVars);
    const datasetCount = computed(() => countDatasetsResult.value?.countDatasets);
    const groupLink = computed(() => ({
      name: 'group',
      params: { groupIdOrSlug: props.urlSlug || props.id },
    }));

    const datasetsLink = computed(() => ({
      path: '/datasets',
      query: encodeParams({ group: props.id }),
    }));

    const managementLink = computed(() => ({
      name: 'group',
      params: { groupIdOrSlug: props.urlSlug || props.id },
      query: { tab: props.currentUserRole === UserGroupRoleOptions.GROUP_ADMIN ? 'settings' : 'members' },
    }));

    return () => {
      const { id, name, shortName, numMembers, currentUserRole } = props
      const nOfDatasets : number = (datasetCount.value || 0) as unknown as number

      return (
        <div class='group-item'>
          <div class="group-item-info">
            <div class="group-item-title-wrapper group-item-info-line">
              <RouterLink
                data-test-key="group-link"
                to={groupLink.value}
                class='group-item-title'>
                {name}{shortName ? <span class='group-item-short-name'> ({shortName})</span> : ''}
              </RouterLink>
              <CopyButton
                class="ml-1"
                isId
                text={id}>
                Copy group id to clipboard
              </CopyButton>
            </div>
            <div class="group-item-info-line">
              {
                nOfDatasets > 0
                && <RouterLink to={datasetsLink.value} class='group-item-title'>
                  {plural(nOfDatasets, 'Dataset', 'Datasets')},
                </RouterLink>
              }{' '}
              {plural(numMembers, 'Member', 'Members') }
            </div>
          </div>
          <div class="group-item-actions">
            <div class="flex items-center">
              <ElIcon><PictureFilled /></ElIcon>
              <RouterLink
                data-test-key="dataset-link"
                to={datasetsLink.value} class='ml-1'>
                Browse datasets
              </RouterLink>
            </div>
            <div class="flex items-center">
              <ElIcon><EditPen /></ElIcon>
              <RouterLink
                data-test-key="manage-link"
                to={managementLink.value} class='ml-1'>
                {currentUserRole === UserGroupRoleOptions.GROUP_ADMIN ? 'Manage' : 'Browse'} group
              </RouterLink>
            </div>
          </div>
        </div>
      )
    }

  },
});
