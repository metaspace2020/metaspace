import { computed, defineComponent, reactive } from 'vue'
import { ElButton, ElInput, ElIcon } from '../../lib/element-plus'
import { useQuery } from '@vue/apollo-composable'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import { getUserGroupsQuery, ViewGroupResult } from '../../api/group'
import { uniqBy } from 'lodash-es'
import GroupsListItem from './GroupsListItem'
import './GroupsListPage.scss'
import { Loading, Search } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

interface GroupListPageState {
  groupNameFilter: string | undefined
}

export default defineComponent({
  name: 'GroupsListPage',
  props: {
    className: {
      type: String,
      default: 'groups-list',
    },
  },
  setup: function () {
    const router = useRouter()
    const state = reactive<GroupListPageState>({
      groupNameFilter: '',
    })

    const { result: currentUserResult } = useQuery<CurrentUserRoleResult | any>(currentUserRoleQuery)
    const currentUser = computed(() => (currentUserResult.value != null ? currentUserResult.value.currentUser : null))

    const queryVars = computed(() => ({
      query: state.groupNameFilter,
      useRole: true,
    }))
    const { result: groupsResult, loading: groupsLoading } = useQuery<ViewGroupResult | any>(
      getUserGroupsQuery,
      queryVars,
      { fetchPolicy: 'network-only' }
    )
    const groups = computed(() => (groupsResult.value != null ? groupsResult.value.allGroups : null))

    const handleCreateGroup = async () => {
      await router.push('/group/create')
    }

    return () => {
      if (!currentUser.value && !groupsLoading.value) {
        return (
          <div class="groups-list-container">
            <div class="groups-list-wrapper">
              <p class="font-normal text-center">
                Create an account/login, to create groups and make your work reach more people!
              </p>
            </div>
          </div>
        )
      }

      return (
        <div class="groups-list-container">
          <div class="groups-list-wrapper">
            <div class="groups-list-header">
              <ElInput
                class="group-name-filter tf-outer w-auto"
                modelValue={state.groupNameFilter}
                onInput={(value: string) => {
                  state.groupNameFilter = value
                }}
                placeholder="Enter keywords"
                v-slots={{
                  prepend: () => (
                    <ElIcon class="-mx-1">
                      <Search />
                    </ElIcon>
                  ),
                }}
              />
              <ElButton type="primary" size="large" class="group-list-create-btn" onClick={handleCreateGroup}>
                Create group
              </ElButton>
            </div>
            <div class="groups-list-content">
              {groups.value?.length === 0 && !groupsLoading.value && <p>Group not found!</p>}
              {groups.value?.length > 0 &&
                !groupsLoading.value &&
                uniqBy((groups.value || []) as any[], 'id').map((group: any) => {
                  return (
                    <GroupsListItem
                      id={group.id}
                      name={group.name}
                      shortName={group.shortName}
                      urlSlug={group.urlSlug}
                      currentUserRole={group.currentUserRole}
                      numMembers={group.numMembers}
                    />
                  )
                })}
              {groupsLoading.value && (
                <p>
                  <ElIcon class="is-loading">
                    <Loading />
                  </ElIcon>
                </p>
              )}
            </div>
          </div>
        </div>
      )
    }
  },
})
