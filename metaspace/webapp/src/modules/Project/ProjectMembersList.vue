<template>
  <members-list
    :loading="loading || loadingInternal"
    :current-user="currentUser"
    :members="sortedMembers"
    type="project"
    :filter="datasetsListFilter"
    :can-edit="canEdit"
    @removeUser="handleRemoveUser"
    @cancelInvite="handleRemoveUser"
    @acceptUser="handleAcceptUser"
    @rejectUser="handleRejectUser"
    @addMember="() => handleAddMember(/* Discard the event argument. ConfirmAsync adds an argument to the end of the arguments list, so the arguments list must be predictable */)"
    @updateRole="handleUpdateRole"
  />
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { sortBy } from 'lodash-es'
import {
  acceptRequestToJoinProjectMutation,
  ViewProjectMember,
  inviteUserToProjectMutation,
  ProjectRole,
  ProjectRoleOptions as PRO,
  removeUserFromProjectMutation,
  updateUserProjectMutation,
} from '../../api/project'
import MembersList from '../../components/MembersList.vue'
import { CurrentUserRoleResult } from '../../api/user'
import ConfirmAsync from '../../components/ConfirmAsync'
import emailRegex from '../../lib/emailRegex'

  interface ProjectInfo {
    id: string;
    name: string;
    currentUserRole: ProjectRole;
  }

  @Component<ProjectMembersList>({
    components: {
      MembersList,
    },
  })
export default class ProjectMembersList extends Vue {
    @Prop()
    currentUser!: CurrentUserRoleResult | null;

    @Prop()
    project!: ProjectInfo | null;

    @Prop({ type: Array, required: true })
    members!: ViewProjectMember[];

    @Prop({ type: Boolean })
    loading!: boolean;

    @Prop({ type: Function })
    refreshData!: () => Promise<any>;

    loadingInternal: boolean = false;

    get projectId() {
      return this.project && this.project.id
    }

    get projectName() {
      return this.project && this.project.name
    }

    get canEdit(): boolean {
      return (this.currentUser && this.currentUser.role === 'admin')
        || (this.project && this.project.currentUserRole === 'MANAGER')
        || false
    }

    get datasetsListFilter() {
      return {
        project: this.projectId,
      }
    }

    get sortedMembers() {
      const roleOrder = [PRO.MANAGER, PRO.MEMBER, PRO.PENDING, PRO.INVITED]
      return sortBy(this.members, m => roleOrder.indexOf(m.role))
    }

    @ConfirmAsync(function(this: ProjectMembersList, member: ViewProjectMember) {
      return {
        message: `Are you sure you want to remove ${member.user.name} from ${this.projectName}?`,
        confirmButtonText: 'Remove user',
        confirmButtonLoadingText: 'Removing...',
      }
    })
    async handleRemoveUser(member: ViewProjectMember) {
      await this.$apollo.mutate({
        mutation: removeUserFromProjectMutation,
        variables: { projectId: this.projectId, userId: member.user.id },
      })
      await this.refreshData()
    }

    @ConfirmAsync(function(this: ProjectMembersList, member: ViewProjectMember) {
      return {
        message: `This will allow ${member.user.name} to access all private datasets that are in ${this.projectName}. `
        + 'Are you sure you want to accept them into the project?',
        confirmButtonText: 'Accept request',
        confirmButtonLoadingText: 'Accepting...',
      }
    })
    async handleAcceptUser(member: ViewProjectMember) {
      await this.$apollo.mutate({
        mutation: acceptRequestToJoinProjectMutation,
        variables: { projectId: this.projectId, userId: member.user.id },
      })
      await this.refreshData()
    }

    @ConfirmAsync(function(this: ProjectMembersList, member: ViewProjectMember) {
      return {
        message: `Are you sure you want to decline ${member.user.name}'s request for access to ${this.projectName}?`,
        confirmButtonText: 'Decline request',
        confirmButtonLoadingText: 'Declining...',
      }
    })
    async handleRejectUser(member: ViewProjectMember) {
      await this.$apollo.mutate({
        mutation: removeUserFromProjectMutation,
        variables: { projectId: this.projectId, userId: member.user.id },
      })
      await this.refreshData()
    }

    @ConfirmAsync(function(this: ProjectMembersList) {
      return {
        title: 'Add member',
        message: 'An email will be sent inviting them to join the project. If they accept the invitation, '
        + `they will be able to access the private datasets of ${this.projectName}.`,
        showInput: true,
        inputPlaceholder: 'Email address',
        inputPattern: emailRegex,
        inputErrorMessage: 'Please enter a valid email address',
        confirmButtonText: 'Invite to project',
        confirmButtonLoadingText: 'Sending invitation...',
      }
    })
    async handleAddMember(email: string) {
      await this.$apollo.mutate({
        mutation: inviteUserToProjectMutation,
        variables: { projectId: this.projectId, email },
      })
      await this.refreshData()
    }

    async handleUpdateRole(member: ViewProjectMember, role: ProjectRole | null) {
      try {
        this.loadingInternal = true
        await this.$apollo.mutate({
          mutation: updateUserProjectMutation,
          variables: {
            projectId: this.projectId,
            userId: member.user.id,
            update: { role },
          },
        })
        await this.refreshData()
      } finally {
        this.loadingInternal = false
      }
    }
}

</script>
