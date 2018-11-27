<template>
  <div>
    <transfer-datasets-dialog
      v-if="showTransferDatasetsDialog"
      :groupName="invitingGroup && invitingGroup.name"
      :isInvited="true"
      @accept="handleAcceptTransferDatasets"
      @close="handleCloseTransferDatasetsDialog"
    />
    <div style="padding-left: 15px;">
      <el-table :data="rows" class="table">
        <el-table-column label="Group">
          <template slot-scope="scope">
            <router-link :to="scope.row.route">{{scope.row.name}}</router-link>
            <notification-icon
              v-if="scope.row.hasPendingRequest"
              :tooltip="`${scope.row.name} has a pending membership request.`"
              tooltipPlacement="right" />
          </template>
        </el-table-column>
        <el-table-column prop="roleName" label="Role" width="160" />
        <el-table-column label="Datasets contributed" width="160" align="center">
          <template slot-scope="scope">
            <router-link v-if="scope.row.numDatasets > 0" :to="scope.row.datasetsRoute">
              {{scope.row.numDatasets}}
            </router-link>
            <span v-if="scope.row.numDatasets === 0">{{scope.row.numDatasets}}</span>
          </template>
        </el-table-column>
        <el-table-column width="240" align="right">
          <template slot-scope="scope">
            <el-button
              v-if="scope.row.role === 'MEMBER'"
              size="mini"
              icon="el-icon-arrow-right"
              @click="handleLeave(scope.row)">
              Leave
            </el-button>
            <el-button
              v-if="scope.row.role === 'GROUP_ADMIN'"
              size="mini"
              icon="el-icon-arrow-right"
              disabled>
              Leave
            </el-button>
            <el-button
              v-if="scope.row.role === 'INVITED'"
              size="mini"
              type="success"
              @click="handleAcceptInvitation(scope.row)"
              icon="el-icon-check">
              Accept
            </el-button>
            <el-button
              v-if="scope.row.role === 'INVITED'"
              size="mini"
              icon="el-icon-close"
              @click="handleDeclineInvitation(scope.row)">
              Decline
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import { UserProfileQuery } from '../../api/user';
  import {
    acceptGroupInvitationMutation,
    getRoleName,
    importDatasetsIntoGroupMutation,
    leaveGroupMutation,
    UserGroupRole,
  } from '../../api/group';
  import reportError from '../../lib/reportError';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import NotificationIcon from '../../components/NotificationIcon.vue';
  import { encodeParams } from '../Filters';
  import { TransferDatasetsDialog } from '../GroupProfile';

  interface GroupRow {
    id: string;
    name: string;
    role: UserGroupRole;
    roleName: string;
    numDatasets: number;
  }

  @Component({
    components: {
      TransferDatasetsDialog,
      NotificationIcon,
    }
  })
  export default class GroupsTable extends Vue {
    @Prop()
    currentUser!: UserProfileQuery | null;
    @Prop()
    refetchData!: () => void;

    showTransferDatasetsDialog: boolean = false;
    invitingGroup: GroupRow | null = null;

    get rows(): GroupRow[] {
      if (this.currentUser != null && this.currentUser.groups != null) {
        return this.currentUser.groups.map((item) => {
          const {group, numDatasets, role} = item;
          const {id, name, urlSlug, hasPendingRequest} = group;

          return {
            id, name, role, numDatasets, hasPendingRequest,
            roleName: getRoleName(role),
            route: {
              name: 'group',
              params: { groupIdOrSlug: urlSlug || id }
            },
            datasetsRoute: {
              path: '/datasets',
              query: encodeParams({ submitter: this.currentUser!.id, group: id })
            },
          };
        });
      }
      return [];
    }

    @ConfirmAsync((groupRow: GroupRow) => ({
        message: `Are you sure you want to leave ${groupRow.name}?`,
        confirmButtonText: "Yes, leave the group",
        confirmButtonLoadingText: 'Leaving...'
    }))
    async handleLeave(groupRow: GroupRow) {
      await this.$apollo.mutate({
        mutation: leaveGroupMutation,
        variables: { groupId: groupRow.id }
      });
      await this.refetchData();
      this.$message({ message: "You have successfully left the group" });
    }

    @ConfirmAsync((groupRow: GroupRow) => ({
      message: `Are you sure you want to decline the invitation to ${groupRow.name}?`,
      confirmButtonText: "Yes, decline the invitation",
      confirmButtonLoadingText: 'Leaving...'
    }))
    async handleDeclineInvitation(groupRow: GroupRow) {
      await this.$apollo.mutate({
        mutation: leaveGroupMutation,
        variables: { groupId: groupRow.id }
      });
      await this.refetchData();
      this.$message({ message: "You have declined the invitation" });
    }

    async handleAcceptInvitation(groupRow: GroupRow) {
      this.showTransferDatasetsDialog = true;
      this.invitingGroup = groupRow;
    }

    async handleAcceptTransferDatasets(selectedDatasetIds: string[]) {
      try {
        await this.$apollo.mutate({
          mutation: acceptGroupInvitationMutation,
          variables: { groupId: this.invitingGroup!.id },
        });
        if (selectedDatasetIds.length > 0) {
          await this.$apollo.mutate({
            mutation: importDatasetsIntoGroupMutation,
            variables: { groupId: this.invitingGroup!.id, datasetIds: selectedDatasetIds },
          });
        }

        await this.refetchData();
        this.$message({
          type: "success",
          message: `You are now a member of ${this.invitingGroup!.name}!`
        });
      } catch(err) {
        reportError(err);
      } finally {
        this.showTransferDatasetsDialog = false;
      }
    }

    handleCloseTransferDatasetsDialog() {
      this.showTransferDatasetsDialog = false;
    }
  }
</script>

<style scoped>
  .table.el-table /deep/ .cell {
    word-break: normal !important;
  }
</style>
