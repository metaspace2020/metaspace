import './Table.css'

import Vue from 'vue'
import { Button } from 'element-ui'
import { createComponent, reactive } from '@vue/composition-api'

import { UserProfileQuery } from '../../api/user'
import confirmPrompt from '../../components/confirmPrompt'
import NotificationIcon from '../../components/NotificationIcon.vue'
import { TransferDatasetsDialog } from '../GroupProfile'

import {
  acceptGroupInvitationMutation,
  getRoleName,
  importDatasetsIntoGroupMutation,
  leaveGroupMutation,
  UserGroupRole,
} from '../../api/group'
import reportError from '../../lib/reportError'
import { encodeParams } from '../Filters'
import apolloClient from '../../graphqlClient'

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

function getRows({ currentUser }: Props) {
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

interface Props {
  currentUser: UserProfileQuery | null
  refetchData: () => void
}

export const GroupsTable = createComponent<Props>({
  props: {
    refetchData: Function,
    currentUser: Object,
  },
  setup(props, { listeners }) {
    const rows = getRows(props)

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
        listeners.$message({
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
        listeners.$message({ message: 'You have successfully left the group' })
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
        listeners.$message({ message: 'You have declined the invitation' })
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
        <table class="sm-table">
          <col width="40%" />
          <col width="20%" />
          <col width="40%" />
          <thead>
            <tr>
              <th>Group</th>
              <th>Role</th>
              <th>Datasets contributed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length
              ? rows.map(row =>
                <tr>
                  <td>
                    <RouterLink to={row.route}>{row.name}</RouterLink>
                    {row.hasPendingRequest
                      && <NotificationIcon
                        tooltip={`${row.name} has a pending membership request.`}
                        tooltip-placement="right"
                      />}
                  </td>
                  <td>{row.roleName}</td>
                  <td>
                    {row.numDatasets > 0
                      // <RouterLink to={row.datasetsRoute}>{row.numDatasets}</RouterLink>
                      ? row.name
                      : '0'
                    }
                  </td>
                  <td>
                    {row.role === 'MEMBER' && <Button
                      size="mini"
                      icon="el-icon-arrow-right"
                      onClick={handleLeave(row)}
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
                      onClick={handleAcceptInvitation(row)}
                    >
                      Accept
                    </Button>}
                    {row.role === 'INVITED' && <Button
                      size="mini"
                      icon="el-icon-close"
                      onClick={handleDeclineInvitation(row)}
                    >
                      Decline
                    </Button>}
                  </td>
                </tr>,
              ) : (
                <tr class="sm-table-empty-row">
                  <td colspan="3">No data</td>
                </tr>
              )
            }
          </tbody>
        </table>
      </div >
    )
  },
})

export default GroupsTable
