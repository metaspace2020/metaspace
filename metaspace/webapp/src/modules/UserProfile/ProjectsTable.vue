<template>
  <div>
    <el-table
      :data="rows"
      style="width: 100%;padding-left: 15px;">
      <el-table-column label="Project" width="180">
        <template slot-scope="scope">
          <router-link :to="scope.row.route">{{scope.row.name}}</router-link>
        </template>
      </el-table-column>
      <el-table-column
        prop="roleName"
        label="Role"
        width="280"
      />
      <el-table-column label="Datasets contributed">
        <template slot-scope="scope">
          <router-link v-if="scope.row.numDatasets > 0" :to="scope.row.datasetsRoute">
            {{scope.row.numDatasets}}
          </router-link>
          <span v-if="scope.row.numDatasets === 0">{{scope.row.numDatasets}}</span>
        </template>
      </el-table-column>
      <el-table-column>
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
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import { UserProfileQuery } from '../../api/user';
  import { acceptProjectInvitationMutation, getRoleName, leaveProjectMutation, ProjectRole } from '../../api/project';
  import reportError from '../../lib/reportError';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import { encodeParams } from '../../url';

  interface ProjectRow {
    id: string;
    name: string;
    role: ProjectRole;
    roleName: string;
    numDatasets: number;
  }


  @Component
  export default class ProjectsTable extends Vue {
    @Prop()
    currentUser!: UserProfileQuery | null;
    @Prop()
    refetchData!: () => void;

    showTransferDatasetsDialog: boolean = false;
    invitingProject: ProjectRow | null = null;

    get rows(): ProjectRow[] {
      if (this.currentUser != null && this.currentUser.projects != null) {
        const submitter = { id: this.currentUser.id, name: this.currentUser.name };
        return this.currentUser.projects.map((item) => {
          const {project, numDatasets, role} = item;
          const {id, name} = project;

          return {
            id, name, role, numDatasets,
            roleName: getRoleName(role),
            route: `/project/${id}`,
            datasetsRoute: {
              path: '/datasets',
              query: encodeParams({ submitter, project: { id, name } })
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
  }
</script>

<style>
</style>
