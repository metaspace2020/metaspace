<template>
  <div>
    <div class="page">
      <div class="page-content">
        <div class="header-row">
          <h1>Group Details</h1>
          <div class="flex-spacer" />

          <div class="header-row-buttons">
            <el-button v-if="canDelete && group"
                       type="warning"
                       @click="handleDeleteGroup"
                       :loading="isDeleting">
              Delete Group
            </el-button>
            <el-button v-if="canEdit && group"
                       type="primary"
                       @click="handleSave"
                       :loading="isSaving">
              Save
            </el-button>
          </div>
        </div>
        <div>
          <el-form :model="model" :disabled="groupLoading !== 0 || !canEdit">
            <div class="namesRow">
              <el-form-item label="Full name" prop="name" class="name">
                <el-input v-model="model.name" />
              </el-form-item>
              <el-form-item label="Short name" prop="shortName" class="shortName">
                <div slot="label">
                  Short name
                  <el-popover trigger="hover" placement="right">
                    <i slot="reference" class="el-icon-question field-label-help"></i>
                    <p>
                      The short name will be shown whenever space is in a constraint. If not provided, the full name
                      will be used but may be clipped to fit the available space.
                    </p>
                  </el-popover>
                </div>
                <el-input v-model="model.shortName" />
              </el-form-item>
            </div>
          </el-form>
        </div>
        <edit-group-members-list
          :loading="groupLoading !== 0"
          :group="group"
          :canEdit="canEdit"
          @removeUser="handleRemoveUser"
          @cancelInvite="handleRemoveUser"
          @acceptUser="handleAcceptUser"
          @rejectUser="handleRejectUser"
          @addMember="handleAddMember"
        />
        <div>
          <h1>Datasets</h1>
          <router-link :to="datasetsListLink()">See all datasets</router-link>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component, Watch } from 'vue-property-decorator';
  import DatasetItem from '../../components/DatasetItem.vue';
  import {
    acceptRequestToJoinGroupMutation,
    deleteGroupMutation,
    editGroupQuery,
    EditGroupQuery,
    EditGroupQueryMember, inviteUserToGroupMutation, removeUserFromGroupMutation, updateGroupMutation,
    UserGroupRole,
  } from '../../api/group';
  import gql from 'graphql-tag';
  import TransferDatasetsDialog from './TransferDatasetsDialog.vue';
  import EditGroupMembersList from './EditGroupMembersList.vue';
  import { UserRole } from '../../api/user';
  import { encodeParams } from '../../url';
  import ConfirmAsync from './ConfirmAsync';
  import reportError from '../../lib/reportError';

  interface CurrentUserQuery {
    id: string;
    role: UserRole;
  }

  @Component({
    components: {
      DatasetItem,
      TransferDatasetsDialog,
      EditGroupMembersList,
    },
    apollo: {
      currentUser: gql`query {
        currentUser {
          id
          role
        }
      }`,
      group: {
        query: editGroupQuery ,
        loadingKey: 'membersLoading',
        variables(this: EditGroupProfile) { return { groupId: this.groupId } },
      },
      currentUserRoleInGroup: {
        query: gql`query ($groupId: ID!) {
          currentUserRoleInGroup(groupId: $groupId)
        }`,
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
    currentUserRoleInGroup: UserGroupRole | null = null;

    roleNames: Record<UserGroupRole, string> = {
      'PRINCIPAL_INVESTIGATOR': 'Principal Investigator',
      'MEMBER': 'Member',
      'PENDING': 'Requesting access',
      'INVITED': 'Invited',
    };

    get canDelete() {
      return this.currentUser && this.currentUser.role === 'admin';
    }
    get canEdit() {
      return (this.currentUser && this.currentUser.role === 'admin')
        || this.currentUserRoleInGroup === 'PRINCIPAL_INVESTIGATOR';
    }
    get groupId(): string {
      return this.$route.params.groupId;
    }
    get groupName() {
      return this.group ? this.group.name : '';
    }

    @Watch('group')
    setModel() {
      this.model.name = this.group && this.group.name || '';
      this.model.shortName = this.group && this.group.shortName || '';
    }

    datasetsListLink() {
      const filters = {
        group: {id: this.groupId, name: this.groupName},
      };
      const path = '/datasets';
      const query = encodeParams(filters, path, this.$store.state.filterLists);
      return { path, query }
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
          variables: { id: this.groupId },
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
        await this.$apollo.mutate({
          mutation: updateGroupMutation,
          variables: { id: this.groupId, groupDetails: { name, shortName } },
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

    @ConfirmAsync(function (this: EditGroupProfile, member: EditGroupQueryMember) {
      return {
        title: 'Add member',
        message: `An email will be sent inviting them to join the group. If they accept, they will be able to access the private datasets of ${this.groupName}.`,
        showInput: true,
        inputPlaceholder: 'Email address',
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

  .name {
    display: inline-block;
    width: 400px;
  }

  .shortName {
    display: inline-block;
    width: 150px;
    margin-left: 20px;
  }

  .grid-button {
    width: 80px;
  }

  .pagination-row {
    display: flex;
    align-items: center;
    margin-top: 10px;
  }

  .flex-spacer {
    flex-grow: 1;
  }

</style>
