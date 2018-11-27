<template>
  <el-row>
    <create-project-dialog
      :visible="showCreateProjectDialog && currentUser != null"
      :currentUserId="currentUser && currentUser.id"
      @close="handleCloseCreateProjectDialog"
      @create="handleCreateProject"
    />
    <div style="padding-left: 15px">
      <el-table :data="rows" class="table">
        <el-table-column label="Project">
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
              v-if="scope.row.role === 'MANAGER'"
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
    <el-row>
      <el-button style="float: right; margin: 10px 0;" @click="handleOpenCreateProjectDialog">Create project</el-button>
    </el-row>
  </el-row>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import { UserProfileQuery } from '../../api/user';
  import { acceptProjectInvitationMutation, getRoleName, leaveProjectMutation, ProjectRole } from '../../api/project';
  import reportError from '../../lib/reportError';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import NotificationIcon from '../../components/NotificationIcon.vue';
  import { encodeParams } from '../Filters';
  import { CreateProjectDialog } from '../Project';

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
    }
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
          const {project, numDatasets, role} = item;
          const {id, name, urlSlug, hasPendingRequest} = project;

          return {
            id, name, role, numDatasets, hasPendingRequest,
            roleName: getRoleName(role),
            route: {
              name: 'project',
              params: {projectIdOrSlug: urlSlug || id}
            },
            datasetsRoute: {
              path: '/datasets',
              query: encodeParams({ submitter: this.currentUser!.id, project: id })
            },
          };
        });
      }
      return [];
    }

    @ConfirmAsync((projectRow: ProjectRow) => ({
        message: `Are you sure you want to leave ${projectRow.name}?`,
        confirmButtonText: "Yes, leave the project",
        confirmButtonLoadingText: 'Leaving...'
    }))
    async handleLeave(projectRow: ProjectRow) {
      await this.$apollo.mutate({
        mutation: leaveProjectMutation,
        variables: { projectId: projectRow.id }
      });
      await this.refetchData();
      this.$message({ message: "You have successfully left the project" });
    }

    @ConfirmAsync((projectRow: ProjectRow) => ({
      message: `Are you sure you want to decline the invitation to ${projectRow.name}?`,
      confirmButtonText: "Yes, decline the invitation",
      confirmButtonLoadingText: 'Leaving...'
    }))
    async handleDeclineInvitation(projectRow: ProjectRow) {
      await this.$apollo.mutate({
        mutation: leaveProjectMutation,
        variables: { projectId: projectRow.id }
      });
      await this.refetchData();
      this.$message({ message: "You have declined the invitation" });
    }

    async handleAcceptInvitation(projectRow: ProjectRow) {
      try {
        await this.$apollo.mutate({
          mutation: acceptProjectInvitationMutation,
          variables: { projectId: projectRow.id },
        });
        await this.refetchData();
        this.$message({
          type: "success",
          message: `You are now a member of ${projectRow.name}`
        });
      } catch(err) {
        reportError(err);
      } finally {
        this.showTransferDatasetsDialog = false;
      }
    }

    handleOpenCreateProjectDialog() {
      this.showCreateProjectDialog = true;
    }

    handleCloseCreateProjectDialog() {
      this.showCreateProjectDialog = false;
    }

    handleCreateProject({id}: {id: string}) {
      this.$router.push({name: 'project', params: {projectIdOrSlug: id}});
    }


  }
</script>

<style scoped>
  .table.el-table /deep/ .cell {
    word-break: normal !important;
  }
</style>
