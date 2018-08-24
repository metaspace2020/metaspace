<template>
  <div>
    <transfer-datasets-dialog
      v-if="showTransferDatasetsDialog"
      :currentUserId="currentUser && currentUser.id"
      :groupName="invitingGroup && invitingGroup.name"
      :isInvited="true"
      @accept="handleAcceptTransferDatasets"
      @close="handleCloseTransferDatasetsDialog"
    />
    <membership-table
      type="group"
      :items="currentUser && currentUser.groups"
      @leave="leaveGroup"
      @acceptInvitation="acceptGroupInvitation"
      @declineInvitation="declineGroupInvitation"
    />

  </div>
</template>

<script lang="ts">
  import Vue from 'vue'
  import { Component, Prop } from 'vue-property-decorator';
  import { UserProfileQuery } from '../../api/user';
  import { leaveGroupMutation, acceptGroupInvitationMutation } from '../../api/group';
  import reportError from "../../lib/reportError";
  import ConfirmAsync from '../../components/ConfirmAsync';
  import { importDatasetsIntoGroupMutation } from '../../api/group';
  import MembershipTable from './MembershipTable.vue';
  import { MembershipTableRow } from './MembershipTableRow';


  @Component({
    components: {
      MembershipTable
    }
  })
  export default class GroupsTable extends Vue {
    @Prop()
    currentUser!: UserProfileQuery | null;
    @Prop()
    refetchData!: () => void;

    showTransferDatasetsDialog: boolean = false;
    invitingGroup: MembershipTableRow | null = null;

    @ConfirmAsync((groupRow: MembershipTableRow) => ({
        message: `Are you sure you want to leave ${groupRow.name}?`,
        confirmButtonText: "Yes, leave the group",
        confirmButtonLoadingText: 'Leaving...'
    }))
    async leaveGroup(groupRow: MembershipTableRow) {
      await this.$apollo.mutate({
        mutation: leaveGroupMutation,
        variables: { groupId: groupRow.id }
      });
      await this.refetchData();
      this.$message({ message: "You have successfully left the group" });
    }

    @ConfirmAsync((groupRow: MembershipTableRow) => ({
      message: `Are you sure you want to decline the invitation to ${groupRow.name}?`,
      confirmButtonText: "Yes, decline the invitation",
      confirmButtonLoadingText: 'Leaving...'
    }))
    async declineGroupInvitation(groupRow: MembershipTableRow) {
      await this.$apollo.mutate({
        mutation: leaveGroupMutation,
        variables: { groupId: groupRow.id }
      });
      await this.refetchData();
      this.$message({ message: "You have declined the invitation" });
    }

    async acceptGroupInvitation(groupRow: MembershipTableRow) {
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
          message: "You have successfully joined the group!"
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
</style>
