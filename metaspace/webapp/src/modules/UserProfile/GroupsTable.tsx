import ElementUI from 'element-ui'
import { createComponent, reactive } from '@vue/composition-api';

import { UserProfileQuery, userProfileQuery } from '../../api/user'
import ConfirmAsync from '../../components/ConfirmAsync'
import NotificationIcon from '../../components/NotificationIcon'
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
  return [];
}

export default createComponent({
  name: 'ProjectsTable',

  setup(props: Props, { }) {
    const rows = getRows(props);

    const state = reactive<State>({
      showTransferDatasetsDialog: false,
      invitingGroup: null
    });

    async function handleAcceptTransferDatasets(selectedDatasetIds: string[]) {
      try {
        await apolloClient.mutate({
          mutation: acceptGroupInvitationMutation,
          variables: { groupId: this.invitingGroup!.id },
        })
        if (selectedDatasetIds.length > 0) {
          await apolloClient.mutate({
            mutation: importDatasetsIntoGroupMutation,
            variables: { groupId: this.invitingGroup!.id, datasetIds: selectedDatasetIds },
          })
        }

        await props.refetchData()
        this.$message({
          type: 'success',
          message: `You are now a member of ${this.invitingGroup!.name}!`,
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
        {state.showTransferDatasetsDialog &&
          <TransferDatasetsDialog
            groupName={state.invitingGroup && state.invitingGroup.name}
            isInvited
            onAccept={handleAcceptTransferDatasets}
            onClose={handleCloseTransferDatasetsDialog}
          />
        }
        <p>GroupsTable</p>
        {/* <div style="padding-left: 15px;">
          <el-table
        : data="rows"
                                                                          class="table"
                                                                        >
        <el-table-column label="Group">
            <template slot-scope="scope">
              <router-link : to="scope.row.route">
              {{ scope.row.name }}
            </router-link>
            <notification-icon
              v-if="scope.row.hasPendingRequest"
              : tooltip="`${scope.row.name} has a pending membership request.`"
tooltip-placement="right"
/>
          </template>
        </el-table-column>
        <el-table-column
          prop="roleName"
          label="Role"
          width="160"
        />
        <el-table-column
          label="Datasets contributed"
          width="160"
          align="center"
        >
          <template slot-scope="scope">
            <router-link
              v-if="scope.row.numDatasets > 0"
              : to="scope.row.datasetsRoute"
>
              {{ scope.row.numDatasets }}
            </router-link>
          <span v-if="scope.row.numDatasets === 0">{{ scope.row.numDatasets }}</span>
          </template>
        </el-table-column>
      <el-table-column
        width="240"
        align="right"
      >
        <template slot-scope="scope">
          <el-button
            v-if="scope.row.role === 'MEMBER'"
            size="mini"
            icon="el-icon-arrow-right"
              @click="handleLeave(scope.row)"
>
Leave
            </el-button>
        <el-button
          v-if="scope.row.role === 'GROUP_ADMIN'"
          size="mini"
          icon="el-icon-arrow-right"
          disabled
        >
          Leave
            </el-button>
        <el-button
          v-if="scope.row.role === 'INVITED'"
          size="mini"
          type="success"
          icon="el-icon-check"
              @click="handleAcceptInvitation(scope.row)"
>
Accept
            </el-button>
      <el-button
        v-if="scope.row.role === 'INVITED'"
        size="mini"
        icon="el-icon-close"
              @click="handleDeclineInvitation(scope.row)"
      >
      Decline
            </el - button >
          </template >
        </el - table - column >
      </el - table >
    </div > */}
      </div >
    );
  },
});
