<template>
  <el-row>
    <create-project-dialog
      :visible="showCreateProjectDialog && currentUser != null"
      :current-user-id="currentUser && currentUser.id"
      @close="handleCloseCreateProjectDialog"
      @create="handleCreateProject"
    />
    <table class="sm-table sm-table-user-details">
      <tr>
        <th>Project</th>
        <th>Role</th>
        <th>Datasets</th>
        <th />
      </tr>
      <tr
        v-for="row in rows"
        :key="row.id"
      >
        <td>
          <div class="sm-table-cell">
            <router-link :to="row.route">
              {{ row.name }}
            </router-link>
            <notification-icon
              v-if="row.hasPendingRequest"
              :tooltip="`${row.name} has a pending membership request.`"
              tooltip-placement="right"
            />
          </div>
        </td>
        <td>
          {{ row.roleName }}
        </td>
        <td>
          <router-link
            v-if="row.numDatasets > 0"
            :to="row.datasetsRoute"
          >
            {{ row.numDatasets }}
          </router-link>
          <span v-if="row.numDatasets === 0">{{ row.numDatasets }}</span>
        </td>
        <td>
          <el-button
            v-if="row.role === 'MEMBER'"
            size="mini"
            icon="el-icon-arrow-right"
            @click="handleLeave(row)"
          >
            Leave
          </el-button>
          <el-button
            v-if="row.role === 'MANAGER'"
            size="mini"
            icon="el-icon-arrow-right"
            disabled
          >
            Leave
          </el-button>
          <el-button
            v-if="row.role === 'INVITED'"
            size="mini"
            type="success"
            icon="el-icon-check"
            @click="handleAcceptInvitation(row)"
          >
            Accept
          </el-button>
          <el-button
            v-if="row.role === 'INVITED'"
            size="mini"
            icon="el-icon-close"
            @click="handleDeclineInvitation(row)"
          >
            Decline
          </el-button>
        </td>
      </tr>
    </table>
    <el-row>
      <el-button
        ref="createBtn"
        style="float: right; margin: 10px 0;"
        @click="handleOpenCreateProjectDialog"
      >
        Create project
      </el-button>
    </el-row>
  </el-row>
</template>

<script lang="ts">
import './Table.css'

import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { UserProfileQuery } from '../../api/user'
import { acceptProjectInvitationMutation, getRoleName, leaveProjectMutation, ProjectRole } from '../../api/project'
import reportError from '../../lib/reportError'
import ConfirmAsync from '../../components/ConfirmAsync'
import NotificationIcon from '../../components/NotificationIcon.vue'
import { encodeParams } from '../Filters'
import { CreateProjectDialog } from '../Project'

  interface ProjectRow {
    id: string;
    name: string;
    role: ProjectRole;
    roleName: string;
    numDatasets: number;
  }

  @Component({
    components: {
      CreateProjectDialog,
      NotificationIcon,
    },
  })
export default class ProjectsTable extends Vue {
    @Prop()
    currentUser!: UserProfileQuery | null;

    @Prop()
    refetchData!: () => void;

    showTransferDatasetsDialog: boolean = false;
    showCreateProjectDialog: boolean = false;
    invitingProject: ProjectRow | null = null;

    get rows(): ProjectRow[] {
      if (this.currentUser != null && this.currentUser.projects != null) {
        return this.currentUser.projects.map((item) => {
          const { project, numDatasets, role } = item
          const { id, name, urlSlug, hasPendingRequest } = project

          return {
            id,
            name,
            role,
            numDatasets,
            hasPendingRequest,
            roleName: getRoleName(role),
            route: {
              name: 'project',
              params: { projectIdOrSlug: urlSlug || id },
            },
            datasetsRoute: {
              path: '/datasets',
              query: encodeParams({ submitter: this.currentUser!.id, project: id }),
            },
          }
        })
      }
      return []
    }

    @ConfirmAsync((projectRow: ProjectRow) => ({
      message: `Are you sure you want to leave ${projectRow.name}?`,
      confirmButtonText: 'Yes, leave the project',
      confirmButtonLoadingText: 'Leaving...',
    }))
    async handleLeave(projectRow: ProjectRow) {
      await this.$apollo.mutate({
        mutation: leaveProjectMutation,
        variables: { projectId: projectRow.id },
      })
      await this.refetchData()
      this.$message({ message: 'You have successfully left the project' })
    }

    @ConfirmAsync((projectRow: ProjectRow) => ({
      message: `Are you sure you want to decline the invitation to ${projectRow.name}?`,
      confirmButtonText: 'Yes, decline the invitation',
      confirmButtonLoadingText: 'Leaving...',
    }))
    async handleDeclineInvitation(projectRow: ProjectRow) {
      await this.$apollo.mutate({
        mutation: leaveProjectMutation,
        variables: { projectId: projectRow.id },
      })
      await this.refetchData()
      this.$message({ message: 'You have declined the invitation' })
    }

    async handleAcceptInvitation(projectRow: ProjectRow) {
      try {
        await this.$apollo.mutate({
          mutation: acceptProjectInvitationMutation,
          variables: { projectId: projectRow.id },
        })
        await this.refetchData()
        this.$message({
          type: 'success',
          message: `You are now a member of ${projectRow.name}`,
        })
      } catch (err) {
        reportError(err)
      } finally {
        this.showTransferDatasetsDialog = false
      }
    }

    handleOpenCreateProjectDialog() {
      // blur on open dialog, so the dialog button can be focused
      const createBtn : any = this.$refs.createBtn as any
      createBtn.$el.blur()
      this.showCreateProjectDialog = true
    }

    handleCloseCreateProjectDialog() {
      this.showCreateProjectDialog = false
    }

    handleCreateProject({ id }: {id: string}) {
      this.$router.push({ name: 'project', params: { projectIdOrSlug: id } })
    }
}
</script>

<style scoped>
  .table.el-table /deep/ .cell {
    word-break: normal !important;
  }
</style>
