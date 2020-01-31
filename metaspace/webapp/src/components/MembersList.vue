<template>
  <div>
    <el-dialog
      v-if="editingRoleOfMember"
      visible
      :title="`Change ${type} member role`"
      @close="handleCloseEditRole"
    >
      <p>
        Change {{ editingRoleOfMember.user.name }}'s role to:
        <el-select v-model="newRole">
          <el-option
            v-for="role in allowedRoles"
            :key="role"
            :value="role"
            :label="getRoleName(role)"
          />
          <el-option
            :value="null"
            :label="`None (remove from ${type})`"
          />
        </el-select>
      </p>
      <p>
        Changing a member's role this way does not cause any notification emails to be sent.
      </p>
      <el-row align="right">
        <el-button @click="handleCloseEditRole">
          Close
        </el-button>
        <el-button
          type="primary"
          @click="handleUpdateRole"
        >
          Save
        </el-button>
      </el-row>
    </el-dialog>
    <el-table
      v-loading="loading"
      :data="currentPageData"
      :row-key="row => row.user.id"
      element-loading-text="Loading results from the server..."
    >
      <p slot="empty">
        You do not have access to view the member list.
      </p>

      <el-table-column
        label="Name"
        min-width="200"
      >
        <template slot-scope="scope">
          {{ scope.row.user.name }}
        </template>
      </el-table-column>

      <el-table-column
        v-if="shouldShowEmails"
        label="Email"
        min-width="200"
      >
        <template slot-scope="scope">
          {{ scope.row.user.email }}
        </template>
      </el-table-column>

      <el-table-column
        label="Role"
        width="160"
      >
        <template slot-scope="scope">
          <a
            v-if="canEditRoleFor(scope.row)"
            href="#"
            title="Change role"
            @click.prevent="() => handleEditRole(scope.row)"
          >
            {{ getRoleName(scope.row.role) }}
          </a>
          <span v-else>
            {{ getRoleName(scope.row.role) }}
          </span>
        </template>
      </el-table-column>

      <el-table-column
        label="Datasets"
        width="90"
        align="center"
      >
        <template slot-scope="scope">
          <router-link :to="datasetsListLink(scope.row.user)">
            {{ scope.row.numDatasets }}
          </router-link>
        </template>
      </el-table-column>

      <el-table-column width="200">
        <template slot-scope="scope">
          <el-button
            v-if="canEdit && scope.row.role === 'MEMBER'"
            size="mini"
            class="grid-button"
            @click="() => handleRemoveUser(scope.row)"
          >
            Remove
          </el-button>
          <el-button
            v-if="canEdit && scope.row.role === 'INVITED'"
            size="mini"
            class="grid-button"
            @click="() => handleCancelInvite(scope.row)"
          >
            Cancel
          </el-button>
          <el-button
            v-if="canEdit && scope.row.role === 'PENDING'"
            size="mini"
            type="success"
            class="grid-button"
            @click="() => handleAcceptUser(scope.row)"
          >
            Accept
          </el-button>
          <el-button
            v-if="canEdit && scope.row.role === 'PENDING'"
            size="mini"
            class="grid-button"
            @click="() => handleRejectUser(scope.row)"
          >
            Decline
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-row">
      <el-pagination
        v-if="members.length > pageSize || page !== 1"
        :total="members.length"
        :page-size="pageSize"
        :current-page.sync="page"
        layout="prev,pager,next"
      />
      <div class="flex-spacer" />
      <el-button
        v-if="canEdit"
        @click="() => handleAddMember()"
      >
        Add member
      </el-button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Emit, Prop } from 'vue-property-decorator'
import { getRoleName as getGroupRoleName, UserGroupRole, UserGroupRoleOptions } from '../api/group'
import { getRoleName as getProjectRoleName, ProjectRole, ProjectRoleOptions } from '../api/project'
import { encodeParams } from '../modules/Filters'
import { CurrentUserRoleResult } from '../api/user'

export interface Member {
    role: UserGroupRole | ProjectRole,
    numDatasets: number,
    user: {
      id: string;
      name: string;
      email: string | null;
    }
  }

  @Component({})
export default class MembersList extends Vue {
    @Prop({ type: Boolean, required: true })
    loading!: boolean;

    @Prop({ type: Object })
    currentUser!: CurrentUserRoleResult | null;

    @Prop({ type: Array, required: true })
    members!: Member[];

    @Prop({ type: Boolean, required: true })
    canEdit!: boolean;

    @Prop({ type: String, required: true })
    type!: 'group' | 'project';

    @Prop({ required: true })
    filter!: any;

    pageSize: number = 10;
    page: number = 1;
    editingRoleOfMember: Member | null = null;
    newRole: string | null = null;

    get getRoleName() {
      return this.type === 'group' ? getGroupRoleName : getProjectRoleName
    }

    get roles(): string[] {
      return this.type === 'group' ? Object.values(UserGroupRoleOptions) : Object.values(ProjectRoleOptions)
    }

    get allowedRoles(): string[] {
      if (this.currentUser != null && this.currentUser.role === 'admin') {
        return this.roles
      } else {
        return this.type === 'group'
          ? [UserGroupRoleOptions.MEMBER, UserGroupRoleOptions.GROUP_ADMIN]
          : [ProjectRoleOptions.MEMBER, ProjectRoleOptions.MANAGER]
      }
    }

    get currentPageData(): Member[] {
      return this.members.slice((this.page - 1) * this.pageSize, this.page * this.pageSize)
    }

    get shouldShowEmails() {
      return this.members.some(m => m.user.email != null)
    }

    canEditRoleFor(user: Member) {
      return this.canEdit
        && this.currentUser != null
        && (this.currentUser.role === 'admin'
          || (this.currentUser.id !== user.user.id && this.allowedRoles.includes(user.role)))
    }

    datasetsListLink(user: Member['user']) {
      return {
        path: '/datasets',
        query: encodeParams({
          ...this.filter,
          submitter: user.id,
        }),
      }
    }

    @Emit('removeUser')
    handleRemoveUser(user: Member) {}

    @Emit('cancelInvite')
    handleCancelInvite(user: Member) {}

    @Emit('acceptUser')
    handleAcceptUser(user: Member) {}

    @Emit('rejectUser')
    handleRejectUser(user: Member) {}

    @Emit('addMember')
    handleAddMember() {}

    handleEditRole(user: Member) {
      this.editingRoleOfMember = user
      this.newRole = user.role
    }

    handleCloseEditRole() {
      this.editingRoleOfMember = null
      this.newRole = null
    }

    handleUpdateRole() {
      this.updateRole(this.editingRoleOfMember!, this.newRole)
      this.editingRoleOfMember = null
      this.newRole = null
    }

    @Emit('updateRole')
    updateRole(user: Member, role: string | null) {}
}

</script>
<style scoped lang="scss">
  .page {
    display: flex;
    justify-content: center;
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
