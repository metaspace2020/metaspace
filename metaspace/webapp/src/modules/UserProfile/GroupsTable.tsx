import './Table.css'

import Vue from 'vue'
import { Button, Message } from '../../lib/element-ui'
import { defineComponent, reactive, computed } from '@vue/composition-api'

import confirmPrompt from '../../components/confirmPrompt'
import NotificationIcon from '../../components/NotificationIcon.vue'
import { TransferDatasetsDialog } from '../Group'

import { UserProfileQuery } from '../../api/user'
import {
  acceptGroupInvitationMutation,
  getRoleName,
  importDatasetsIntoGroupMutation,
  leaveGroupMutation,
  UserGroupRole,
} from '../../api/group'
import reportError from '../../lib/reportError'
import { encodeParams } from '../Filters'
import apolloClient from '../../api/graphqlClient'

const RouterLink = Vue.component('router-link')
interface GroupRow {
  id: string;
  name: string;
  role: UserGroupRole;
  roleName: string;
  numDatasets: number;
}

interface State {
  showTransferDatasetsDialog: boolean
  invitingGroup: GroupRow | null
}

type User = UserProfileQuery | null

interface Props {
  currentUser: User
  refetchData: () => void
}

function getRows(currentUser: User) {
  if (currentUser != null && currentUser.groups != null) {
    return currentUser.groups.map((item) => {
      const { group, numDatasets, role } = item
      const { id, name, urlSlug, hasPendingRequest } = group

      return {
        id,
        name,
        role,
        numDatasets,
        hasPendingRequest,
        roleName: getRoleName(role),
        route: {
          name: 'group',
          params: { groupIdOrSlug: urlSlug || id },
        },
        datasetsRoute: {
          path: '/datasets',
          query: encodeParams({ submitter: currentUser!.id, group: id }),
        },
      }
    })
  }
  return []
}

const GroupsTable = defineComponent<Props>({
  props: {
    currentUser: Object,
    refetchData: Function,
  },
  setup(props) {
    const rows = computed(() => getRows(props.currentUser))
    const state = reactive<State>({
      showTransferDatasetsDialog: false,
      invitingGroup: null,
    })

    async function handleAcceptTransferDatasets(selectedDatasetIds: string[]) {
      try {
        await apolloClient.mutate({
          mutation: acceptGroupInvitationMutation,
          variables: { groupId: state.invitingGroup!.id },
        })
        if (selectedDatasetIds.length > 0) {
          await apolloClient.mutate({
            mutation: importDatasetsIntoGroupMutation,
            variables: { groupId: state.invitingGroup!.id, datasetIds: selectedDatasetIds },
          })
        }

        await props.refetchData()
        Message({
          type: 'success',
          message: `You are now a member of ${state.invitingGroup!.name}!`,
        })
      } catch (err) {
        reportError(err)
      } finally {
        state.showTransferDatasetsDialog = false
      }
    }

    function handleLeave(groupRow: GroupRow) {
      confirmPrompt({
        message: `Are you sure you want to leave ${groupRow.name}?`,
        confirmButtonText: 'Yes, leave the group',
        confirmButtonLoadingText: 'Leaving...',
      }, async() => {
        await apolloClient.mutate({
          mutation: leaveGroupMutation,
          variables: { groupId: groupRow.id },
        })
        await props.refetchData()
        Message({ message: 'You have successfully left the group' })
      })
    }

    async function handleDeclineInvitation(groupRow: GroupRow) {
      confirmPrompt({
        message: `Are you sure you want to decline the invitation to ${groupRow.name}?`,
        confirmButtonText: 'Yes, decline the invitation',
        confirmButtonLoadingText: 'Leaving...',
      }, async() => {
        await apolloClient.mutate({
          mutation: leaveGroupMutation,
          variables: { groupId: groupRow.id },
        })
        await props.refetchData()
        Message({ message: 'You have declined the invitation' })
      })
    }

    async function handleAcceptInvitation(groupRow: GroupRow) {
      state.showTransferDatasetsDialog = true
      state.invitingGroup = groupRow
    }

    return () => (
      <div>
        {state.showTransferDatasetsDialog
          && <TransferDatasetsDialog
            groupName={state.invitingGroup && state.invitingGroup.name}
            isInvited
            onAccept={handleAcceptTransferDatasets}
            onClose={() => { state.showTransferDatasetsDialog = false }}
          />
        }
        <table class="sm-table sm-table-user-details">
          <tr>
            <th>Group</th>
            <th>Role</th>
            <th>Datasets</th>
            <th></th>
          </tr>
          {rows.value.length
            ? rows.value.map(row =>
              <tr>
                <td>
                  <div class="sm-table-cell">
                    <RouterLink to={row.route}>{row.name}</RouterLink>
                    {row.hasPendingRequest
                      && <NotificationIcon
                        tooltip={`${row.name} has a pending membership request.`}
                        tooltip-placement="right"
                      />}
                  </div>
                </td>
                <td>{row.roleName}</td>
                <td>
                  {row.numDatasets > 0
                    ? <RouterLink to={row.datasetsRoute}>{row.numDatasets}</RouterLink>
                    : '0'
                  }
                </td>
                <td>
                  <div class="sm-table-button-group">
                    {row.role === 'MEMBER' && <Button
                      size="mini"
                      icon="el-icon-arrow-right"
                      onClick={() => handleLeave(row)}
                    >
                        Leave
                    </Button>}
                    {row.role === 'GROUP_ADMIN' && <Button
                      size="mini"
                      icon="el-icon-arrow-right"
                      disabled
                    >
                        Leave
                    </Button>}
                    {row.role === 'INVITED' && <Button
                      size="mini"
                      type="success"
                      icon="el-icon-check"
                      onClick={() => handleAcceptInvitation(row)}
                    >
                        Accept
                    </Button>}
                    {row.role === 'INVITED' && <Button
                      size="mini"
                      icon="el-icon-close"
                      onClick={() => handleDeclineInvitation(row)}
                    >
                        Decline
                    </Button>}
                  </div>
                </td>
              </tr>,
            ) : (
              <tr class="sm-table-empty-row">
                <td colspan="4">No data</td>
              </tr>
            )
          }
        </table>
      </div >
    )
  },
})

export default GroupsTable
