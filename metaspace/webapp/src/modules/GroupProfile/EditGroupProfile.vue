<template>
  <div>
    <div class="page">
      <div class="page-content">
        <div class="header-row">
          <h1>Group Details</h1>
          <div class="flex-spacer" />

          <div class="header-row-buttons">
            <el-button v-if="canEdit && group"
                       type="primary"
                       @click="handleSave"
                       :loading="isSaving">
              Save
            </el-button>
          </div>
        </div>
        <edit-group-form :model="model" :disabled="isSaving || !canEdit" />
        <members-list
          :loading="groupLoading !== 0"
          :members="group && group.members || []"
          type="group"
          :filter="datasetsListFilter"
          :canEdit="canEdit"
          @removeUser="handleRemoveUser"
          @cancelInvite="handleRemoveUser"
          @acceptUser="handleAcceptUser"
          @rejectUser="handleRejectUser"
          @addMember="handleAddMember"
        />
        <div style="margin-bottom: 2em">
          <h2>Datasets</h2>
          <p>
            <router-link :to="datasetsListLink">See all datasets</router-link>
          </p>
        </div>
        <div v-if="canDelete && group">
          <h2>Delete group</h2>
          <p>
            Please ensure all datasets have been removed before deleting a group.
          </p>
          <div style="text-align: right; margin: 1em 0;">
            <el-button
              type="danger"
              @click="handleDeleteGroup"
              :loading="isDeletingGroup">
              Delete group
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component, Watch } from 'vue-property-decorator';
  import {
    acceptRequestToJoinGroupMutation,
    deleteGroupMutation,
    editGroupQuery,
    EditGroupQuery,
    EditGroupQueryMember,
    inviteUserToGroupMutation,
    removeUserFromGroupMutation,
    UpdateGroupMutation,
    updateGroupMutation,
  } from '../../api/group';
  import gql from 'graphql-tag';
  import EditGroupForm from './EditGroupForm.vue';
  import MembersList from '../../components/MembersList.vue';
  import { UserRole } from '../../api/user';
  import { encodeParams } from '../Filters';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import reportError from '../../lib/reportError';
  import emailRegex from '../../lib/emailRegex';

  interface CurrentUserQuery {
    id: string;
    role: UserRole;
  }

  @Component({
    components: {
      EditGroupForm,
      MembersList,
    },
    apollo: {
      currentUser: gql`query {
        currentUser {
          id
          role
        }
      }`,
      group: {
        query: editGroupQuery,
        loadingKey: 'membersLoading',
        variables(this: EditGroupProfile) { return { groupId: this.groupId } },
      },
    }
  })
  export default class EditGroupProfile extends Vue {
    groupLoading = 0;
    isDeletingGroup = false;
    isSaving = false;
    model = {
      name: '',
      shortName: '',
    };

    currentUser: CurrentUserQuery | null = null;
    group: EditGroupQuery | null = null;

    get canDelete(): boolean {
      return this.currentUser && this.currentUser.role === 'admin' || false;
    }
    get canEdit(): boolean {
      return (this.currentUser && this.currentUser.role === 'admin')
        || (this.group && this.group.currentUserRole === 'PRINCIPAL_INVESTIGATOR')
        || false;
    }
    get groupId(): string {
      return this.$route.params.groupId;
    }
    get groupName() {
      return this.group ? this.group.name : '';
    }
    get datasetsListFilter() {
      return {
        group: this.groupId,
      };
    }

    @Watch('group')
    setModel() {
      this.model.name = this.group && this.group.name || '';
      this.model.shortName = this.group && this.group.shortName || '';
    }

    get datasetsListLink() {
      return { path: '/datasets', query: encodeParams(this.datasetsListFilter) }
    }

    @ConfirmAsync(function (this: EditGroupProfile) {
      return {
        message: `Are you sure you want to delete ${this.groupName}?`,
        confirmButtonText: 'Delete group',
        confirmButtonLoadingText: 'Deleting...'
      }
    })
    async handleDeleteGroup() {
      this.isDeletingGroup = true;
      try {
        const groupName = this.groupName;
        await this.$apollo.mutate({
          mutation: deleteGroupMutation,
          variables: { groupId: this.groupId },
        });
        this.$message({ message: `${groupName} has been deleted`, type: 'success' });
        this.$router.push('/');
      } catch(err) {
        reportError(err);
      } finally {
        this.isDeletingGroup = false;
      }
    }

    async handleSave() {
      this.isSaving = true;
      try {
        const {name, shortName} = this.model;
        await this.$apollo.mutate<UpdateGroupMutation>({
          mutation: updateGroupMutation,
          variables: { groupId: this.groupId, groupDetails: { name, shortName } },
        });
        this.$message({ message: `${name} has been saved`, type: 'success' });
      } catch(err) {
        reportError(err);
      } finally {
        this.isSaving = false;
      }
    }

    @ConfirmAsync(function (this: EditGroupProfile, member: EditGroupQueryMember) {
      return {
        message: `Are you sure you want to remove ${member.user.name} from ${this.groupName}?`,
        confirmButtonText: 'Remove user',
        confirmButtonLoadingText: 'Removing...'
      }
    })
    async handleRemoveUser(member: EditGroupQueryMember) {
      await this.$apollo.mutate({
        mutation: removeUserFromGroupMutation,
        variables: { groupId: this.groupId, userId: member.user.id },
      });
      await this.$apollo.queries.group.refetch();
    }

    @ConfirmAsync(function (this: EditGroupProfile, member: EditGroupQueryMember) {
      return {
        message: `This will allow ${member.user.name} to access all private datasets that are in ${this.groupName}. Are you sure you want to accept them into the group?`,
        confirmButtonText: 'Accept request',
        confirmButtonLoadingText: 'Accepting...'
      }
    })
    async handleAcceptUser(member: EditGroupQueryMember) {
      await this.$apollo.mutate({
        mutation: acceptRequestToJoinGroupMutation,
        variables: { groupId: this.groupId, userId: member.user.id },
      });
      await this.$apollo.queries.group.refetch();
    }

    @ConfirmAsync(function (this: EditGroupProfile, member: EditGroupQueryMember) {
      return {
        message: `Are you sure you want to decline ${member.user.name}'s request for access to ${this.groupName}?`,
        confirmButtonText: 'Decline request',
        confirmButtonLoadingText: 'Declining...'
      }
    })
    async handleRejectUser(member: EditGroupQueryMember) {
      await this.$apollo.mutate({
        mutation: removeUserFromGroupMutation,
        variables: { groupId: this.groupId, userId: member.user.id },
      });
      await this.$apollo.queries.group.refetch();
    }

    @ConfirmAsync(function (this: EditGroupProfile) {
      return {
        title: 'Add member',
        message: `An email will be sent inviting them to join the group. If they accept the invitation, they will be able to access the private datasets of ${this.groupName}.`,
        showInput: true,
        inputPlaceholder: 'Email address',
        inputPattern: emailRegex,
        inputErrorMessage: 'Please enter a valid email address',
        confirmButtonText: 'Invite to group',
        confirmButtonLoadingText: 'Sending invitation...'
      }
    })
    async handleAddMember(email: string) {
      await this.$apollo.mutate({
        mutation: inviteUserToGroupMutation,
        variables: { groupId: this.groupId, email },
      });
      await this.$apollo.queries.group.refetch();
    }
  }

</script>
<style scoped lang="scss">
  .page {
    display: flex;
    justify-content: center;
    min-height: 80vh; // Ensure there's space for the loading spinner before is visible
  }

  .page-content {
    width: 950px;
  }

  .header-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  }

  .header-row-buttons {
    display: flex;
    margin-right: 3px;
  }

  .flex-spacer {
    flex-grow: 1;
  }

</style>
