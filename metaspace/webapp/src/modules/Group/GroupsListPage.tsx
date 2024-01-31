import { computed, defineComponent, reactive } from '@vue/composition-api'
import { Button, Input } from '../../lib/element-ui'
import { useQuery } from '@vue/apollo-composable'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import { getUserGroupsQuery, ViewGroupResult } from '../../api/group'
import { uniqBy } from 'lodash-es'
import GroupsListItem from './GroupsListItem'
import './GroupsListPage.scss'

interface GroupListPageProps {
  className: string
}

interface GroupListPageState {
  groupNameFilter: string | undefined
}

export default defineComponent<GroupListPageProps>({
  name: 'GroupsListPage',
  props: {
    className: {
      type: String,
      default: 'groups-list',
    },
  },
  setup: function(props, ctx) {
    const { $router } = ctx.root
    const state = reactive<GroupListPageState>({
      groupNameFilter: '',
    })

    const {
      result: currentUserResult,
    } = useQuery<CurrentUserRoleResult|any>(currentUserRoleQuery)
    const currentUser = computed(() => currentUserResult.value != null ? currentUserResult.value.currentUser
      : null)

    const queryVars = computed(() => ({
      query: state.groupNameFilter,
      useRole: true,
    }))
    const {
      result: groupsResult,
      loading: groupsLoading,
    } = useQuery<ViewGroupResult|any>(getUserGroupsQuery, queryVars)
    const groups = computed(() => groupsResult.value != null ? groupsResult.value.allGroups
      : null)

    const handleCreateGroup = () => {
      $router.push('/group/create')
    }

    return () => {
      if (!currentUser.value) {
        return (
          <div class='groups-list-container'>
            <div class='groups-list-wrapper'>
              <p class='font-normal text-center'>
                Create an account/login, to create groups and make your work reach more people!
              </p>
            </div>
          </div>)
      }

      return (
        <div class='groups-list-container'>
          <div class='groups-list-wrapper'>
            <div class='groups-list-header'>
              <Input
                class='group-name-filter tf-outer w-auto'
                value={state.groupNameFilter}
                onInput={(value: string) => {
                  state.groupNameFilter = value
                }}
                placeholder='Enter keywords'
              >
                <i
                  slot="prepend"
                  class="el-icon-search -mx-1"
                />
              </Input>
              <Button
                type="primary"
                class='group-list-create-btn'
                onClick={handleCreateGroup}
              >
                Create group
              </Button>
            </div>
            <div class='groups-list-content'>
              {
                groups.value?.length === 0
                && !groupsLoading.value
                && <p>Group not found!</p>
              }
              {
                groups.value?.length > 0
                && !groupsLoading.value
                && uniqBy((groups.value || []) as any[], 'id').map((group: any) => {
                  return <GroupsListItem
                    id={group.id}
                    name={group.name}
                    shortName={group.shortName}
                    urlSlug={group.urlSlug}
                    currentUserRole={group.currentUserRole}
                    numMembers={group.numMembers}/>
                })
              }
              {
                groupsLoading.value
                && <p><i class="el-icon-loading"/></p>
              }
            </div>
          </div>
        </div>
      )
    }
  },
})
