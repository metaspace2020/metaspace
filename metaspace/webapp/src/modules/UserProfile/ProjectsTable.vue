<template>
  <div>
    <membership-table
      type="project"
      :items="currentUser && currentUser.projects"
      @leave="leaveProject"
      @acceptInvitation="acceptProjectInvitation"
      @declineInvitation="declineProjectInvitation"
    />
  </div>
</template>

<script lang="ts">
  import Vue from 'vue'
  import { Component, Prop } from 'vue-property-decorator';
  import { UserProfileQuery } from '../../api/user';
  import { leaveProjectMutation, acceptProjectInvitationMutation } from '../../api/project';
  import reportError from "../../lib/reportError";
  import ConfirmAsync from '../../components/ConfirmAsync';
  import MembershipTable from './MembershipTable.vue';
  import { MembershipTableRow } from './MembershipTableRow';


  @Component({
    components: {
      MembershipTable
    }
  })
  export default class ProjectsTable extends Vue {
    @Prop()
    currentUser!: UserProfileQuery | null;
    @Prop()
    refetchData!: () => void;

    showTransferDatasetsDialog: boolean = false;
    invitingProject: MembershipTableRow | null = null;

    @ConfirmAsync((projectRow: MembershipTableRow) => ({
        message: `Are you sure you want to leave ${projectRow.name}?`,
        confirmButtonText: "Yes, leave the project",
        confirmButtonLoadingText: 'Leaving...'
    }))
    async leaveProject(projectRow: MembershipTableRow) {
      await this.$apollo.mutate({
        mutation: leaveProjectMutation,
        variables: { projectId: projectRow.id }
      });
      await this.refetchData();
      this.$message({ message: "You have successfully left the project" });
    }

    @ConfirmAsync((projectRow: MembershipTableRow) => ({
      message: `Are you sure you want to decline the invitation to ${projectRow.name}?`,
      confirmButtonText: "Yes, decline the invitation",
      confirmButtonLoadingText: 'Leaving...'
    }))
    async declineProjectInvitation(projectRow: MembershipTableRow) {
      await this.$apollo.mutate({
        mutation: leaveProjectMutation,
        variables: { projectId: projectRow.id }
      });
      await this.refetchData();
      this.$message({ message: "You have declined the invitation" });
    }

    async acceptProjectInvitation(projectRow: MembershipTableRow) {
      try {
        await this.$apollo.mutate({
          mutation: acceptProjectInvitationMutation,
          variables: { projectId: this.invitingProject!.id },
        });
        await this.refetchData();
        this.$message({
          type: "success",
          message: "You have successfully joined the project!"
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
