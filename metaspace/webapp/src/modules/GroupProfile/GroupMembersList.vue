<template>
  <members-list
    :loading="loading || loadingInternal"
    :current-user="currentUser"
    :members="members"
    type="group"
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
import { Prop } from 'vue-property-decorator'
import {
  acceptRequestToJoinGroupMutation,
  EditGroupQuery,
  EditGroupQueryMember,
  inviteUserToGroupMutation,
  removeUserFromGroupMutation,
  updateUserGroupMutation,
  UserGroupRole,
  UserGroupRoleOptions as UGRO,
} from '../../api/group'
import MembersList from '../../components/MembersList.vue'
import ConfirmAsync from '../../components/ConfirmAsync'
import emailRegex from '../../lib/emailRegex'
import { CurrentUserRoleResult } from '../../api/user'
import { sortBy } from 'lodash-es'
import Component from 'vue-class-component'

  @Component({
    components: {
      MembersList,
    },
  })
export default class GroupMembersList extends Vue {
    @Prop()
    currentUser!: CurrentUserRoleResult | null;

    @Prop()
    group!: EditGroupQuery | null;

    @Prop({ type: Array, required: true })
    members!: EditGroupQueryMember[];

    @Prop({ type: Boolean })
    loading!: boolean;

    @Prop({ type: Function })
    refreshData!: () => Promise<any>;

    loadingInternal: boolean = false;

    get canEdit(): boolean {
      return (this.currentUser && this.currentUser.role === 'admin')
        || (this.group && this.group.currentUserRole === 'GROUP_ADMIN')
        || false
    }

    get groupId() {
      return this.group && this.group.id
    }

    get groupName() {
      return this.group ? this.group.name : ''
    }

    get datasetsListFilter() {
      return {
        group: this.groupId,
      }
    }

    get sortedMembers() {
      const roleOrder = [UGRO.GROUP_ADMIN, UGRO.MEMBER, UGRO.PENDING, UGRO.INVITED]
      return sortBy(this.members, m => roleOrder.indexOf(m.role))
    }

    @ConfirmAsync(function(this: GroupMembersList, member: EditGroupQueryMember) {
      return {
        message: `Are you sure you want to remove ${member.user.name} from ${this.groupName}?`,
        confirmButtonText: 'Remove user',
        confirmButtonLoadingText: 'Removing...',
      }
    })
    async handleRemoveUser(member: EditGroupQueryMember) {
      await this.$apollo.mutate({
        mutation: removeUserFromGroupMutation,
        variables: { groupId: this.groupId, userId: member.user.id },
      })
      await this.refreshData()
    }

    @ConfirmAsync(function(this: GroupMembersList, member: EditGroupQueryMember) {
      return {
        message: `This will allow ${member.user.name} to access all private datasets that are in ${this.groupName}. `
        + 'Are you sure you want to accept them into the group?',
        confirmButtonText: 'Accept request',
        confirmButtonLoadingText: 'Accepting...',
      }
    })
    async handleAcceptUser(member: EditGroupQueryMember) {
      await this.$apollo.mutate({
        mutation: acceptRequestToJoinGroupMutation,
        variables: { groupId: this.groupId, userId: member.user.id },
      })
      await this.refreshData()
    }

    @ConfirmAsync(function(this: GroupMembersList, member: EditGroupQueryMember) {
      return {
        message: `Are you sure you want to decline ${member.user.name}'s request for access to ${this.groupName}?`,
        confirmButtonText: 'Decline request',
        confirmButtonLoadingText: 'Declining...',
      }
    })
    async handleRejectUser(member: EditGroupQueryMember) {
      await this.$apollo.mutate({
        mutation: removeUserFromGroupMutation,
        variables: { groupId: this.groupId, userId: member.user.id },
      })
      await this.refreshData()
    }

    @ConfirmAsync(function(this: GroupMembersList) {
      return {
        title: 'Add member',
        message: 'An email will be sent inviting them to join the group. '
        + `If they accept the invitation, they will be able to access the private datasets of ${this.groupName}.`,
        showInput: true,
        inputPlaceholder: 'Email address',
        inputPattern: emailRegex,
        inputErrorMessage: 'Please enter a valid email address',
        confirmButtonText: 'Invite to group',
        confirmButtonLoadingText: 'Sending invitation...',
      }
    })
    async handleAddMember(email: string) {
      await this.$apollo.mutate({
        mutation: inviteUserToGroupMutation,
        variables: { groupId: this.groupId, email },
      })
      await this.refreshData()
    }

    async handleUpdateRole(member: EditGroupQueryMember, role: UserGroupRole | null) {
      try {
        this.loadingInternal = true
        await this.$apollo.mutate({
          mutation: updateUserGroupMutation,
          variables: {
            groupId: this.groupId,
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
