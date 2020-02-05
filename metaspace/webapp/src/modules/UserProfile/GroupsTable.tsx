import './Table.css'

import Vue, { Component } from 'vue'

import { Button } from 'element-ui'
import { createComponent, reactive } from '@vue/composition-api'

import { UserProfileQuery, userProfileQuery } from '../../api/user'
import ConfirmAsync from '../../components/ConfirmAsync'
// import NotificationIcon from '../../components/NotificationIcon.vue'
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

const RouterLink = Vue.component('router-link') as Component<any>

interface GroupRow {
  id: string;
  name: string;
  role: UserGroupRole;
  roleName: string;
  numDatasets: number;
}

interface Props {
  currentUser: UserProfileQuery | null
  refetchData: () => void
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

export default createComponent({
  name: 'ProjectsTable',

  setup(props: Props, { listeners }) {
    const rows = getRows(props)
    console.log(rows)

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

    function handleCloseTransferDatasetsDialog() {
      state.showTransferDatasetsDialog = false
    }

    return () => (
      <div>
        {state.showTransferDatasetsDialog
          && <TransferDatasetsDialog
            groupName={state.invitingGroup && state.invitingGroup.name}
            isInvited
            onAccept={handleAcceptTransferDatasets}
            onClose={handleCloseTransferDatasetsDialog}
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
                    {/* <RouterLink to={row.route}>{row.name}</RouterLink> */}
                    {row.name}
                    { row.hasPendingRequest
                      && <notification-icon
                        tooltip={`${row.name} has a pending membership request.`}
                        tooltip-placement="right"
                      /> }
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
                    { row.role === 'MEMBER' && <el-button
                      size="mini"
                      icon="el-icon-arrow-right"
                      onClick="handleLeave(scope.row)"
                    >
                      Leave
                    </el-button> }
                    { row.role === 'GROUP_ADMIN' && <el-button
                      size="mini"
                      icon="el-icon-arrow-right"
                      disabled
                    >
                      Leave
                    </el-button> }
                    { row.role === 'INVITED' && <el-button
                      size="mini"
                      type="success"
                      icon="el-icon-check"
                      onClick="handleAcceptInvitation(scope.row)"
                    >
                      Accept
                    </el-button> }
                    { row.role === 'INVITED' && <el-button
                      size="mini"
                      icon="el-icon-close"
                      onClick="handleDeclineInvitation(scope.row)"
                    >
                      Decline
                    </el-button> }
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
