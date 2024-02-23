import { defineComponent, computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { countGroupDatasets, UserGroupRoleOptions } from '../../api/group'
import { plural } from '../../lib/vueFilters'
import { useRouter } from 'vue-router'
import { encodeParams } from '../Filters'
import CopyButton from '../../components/CopyButton.vue'
import { ElIcon } from 'element-plus'
import { PictureFilled, EditPen } from '@element-plus/icons-vue'
import './GroupsListItem.scss'

interface GroupListItemProps {
  id: string
  name: string
  shortName: string
  currentUserRole: string
  urlSlug: string
  numMembers: number
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
    const router = useRouter()
    const queryVars = computed(() => ({
      groupId: props.id,
    }))

    const { result: countDatasetsResult } = useQuery(countGroupDatasets, queryVars)
    const datasetCount = computed(() => countDatasetsResult.value?.countDatasets)
    const groupLink = computed(() => ({
      name: 'group',
      params: { groupIdOrSlug: props.urlSlug || props.id },
    }))

    const datasetsLink = computed(() => ({
      path: '/datasets',
      query: encodeParams({ group: props.id }),
    }))

    const managementLink = computed(() => ({
      name: 'group',
      params: { groupIdOrSlug: props.urlSlug || props.id },
      query: { tab: props.currentUserRole === UserGroupRoleOptions.GROUP_ADMIN ? 'settings' : 'members' },
    }))

    const handleNavigation = async (params: any) => {
      await router.push(params)
    }

    return () => {
      const { id, name, shortName, numMembers, currentUserRole } = props
      const nOfDatasets: number = (datasetCount.value || 0) as unknown as number

      return (
        <div class="group-item">
          <div class="group-item-info">
            <div class="group-item-title-wrapper group-item-info-line">
              <div
                data-test-key="group-link"
                onClick={() => handleNavigation(groupLink.value)}
                class="group-item-title"
              >
                {name}
                {shortName ? <span class="group-item-short-name"> ({shortName})</span> : ''}
              </div>
              <CopyButton class="ml-1" isId text={id}>
                Copy group id to clipboard
              </CopyButton>
            </div>
            <div class="group-item-info-line">
              {nOfDatasets > 0 && (
                <div onClick={() => handleNavigation(datasetsLink.value)} class="group-item-title">
                  {plural(nOfDatasets, 'Dataset', 'Datasets')},
                </div>
              )}{' '}
              {plural(numMembers, 'Member', 'Members')}
            </div>
          </div>
          <div class="group-item-actions">
            <div class="flex items-center">
              <ElIcon>
                <PictureFilled />
              </ElIcon>
              <div class="link ml-1" data-test-key="dataset-link" onClick={() => handleNavigation(datasetsLink.value)}>
                Browse datasets
              </div>
            </div>
            <div class="flex items-center">
              <ElIcon>
                <EditPen />
              </ElIcon>
              <div class="link ml-1" data-test-key="manage-link" onClick={() => handleNavigation(managementLink.value)}>
                {currentUserRole === UserGroupRoleOptions.GROUP_ADMIN ? 'Manage' : 'Browse'} group
              </div>
            </div>
          </div>
        </div>
      )
    }
  },
})
