<template>
  <div v-loading="!loaded" class="page">
    <div v-if="project != null" class="page-content">
      <div class="header-row">
        <div class="header-names">
          <h1>{{project.name}}</h1>
        </div>

        <div class="header-buttons">
          <el-button v-if="roleInProject == null"
                     type="primary"
                     @click="handleRequestAccess">
            Request access
          </el-button>
          <el-button v-if="roleInProject === 'PENDING'"
                     disabled>
            Request sent
          </el-button>
          <el-button v-if="roleInProject === 'MANAGER'"
                     type="primary"
                     @click="handleManageProject">
            Manage project
          </el-button>
        </div>
        <el-alert v-if="roleInProject === 'INVITED'"
                  type="info"
                  show-icon
                  :closable="false"
                  title="">
          <div style="padding: 0 0 20px 20px;">
            <p>
              You have been invited to join {{project.name}}.
            </p>
            <div>
              <el-button type="danger" @click="handleRejectInvite">
                Decline invitation
              </el-button>
              <el-button type="primary" @click="handleAcceptInvite" :loading="isAcceptingInvite">
                Join project
              </el-button>
            </div>
          </div>
        </el-alert>
      </div>
      <div v-if="projectDatasets.length > 0">
        <h2>Datasets</h2>

        <dataset-list :datasets="projectDatasets.slice(0,8)" />

        <div class="dataset-list-footer">
          <router-link v-if="countDatasets > maxVisibleDatasets" :to="datasetsListLink">See all datasets</router-link>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component } from 'vue-property-decorator';
  import { DatasetDetailItem, datasetDetailItemFragment } from '../../api/dataset';
  import DatasetList from '../Datasets/list/DatasetList.vue';
  import { acceptProjectInvitationMutation, leaveProjectMutation, requestAccessToProjectMutation } from '../../api/project';
  import gql from 'graphql-tag';
  import { encodeParams } from '../Filters';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import reportError from '../../lib/reportError';

  type UserProjectRole = 'INVITED' | 'PENDING' | 'MEMBER' | 'PRINCIPAL_INVESTIGATOR';

  interface ProjectInfo {
    id: string;
    name: string;
    currentUserRole: UserProjectRole | null;
  }

  interface ViewProjectPageData {
    currentUser: { id: string; } | null;
    project: ProjectInfo | null;
    allDatasets: DatasetDetailItem[];
    countDatasets: number;
  }

  @Component({
    components: {
      DatasetList,
    },
    apollo: {
      data: {
        query: gql`query ViewProjectPage($projectId: ID!, $maxVisibleDatasets: Int!, $inpFdrLvls: [Int!] = [10], $checkLvl: Int = 10) {
          currentUser {
            id
          }
          project(projectId: $projectId) {
            id
            name
            currentUserRole
          }
          allDatasets(offset: 0, limit: $maxVisibleDatasets, filter: { project: $projectId }) {
            ...DatasetDetailItem
          }
          countDatasets(filter: { project: $projectId })
        }

        ${datasetDetailItemFragment}`,
        variables(this: ViewProjectPage) {
          return {
            maxVisibleDatasets: this.maxVisibleDatasets,
            projectId: this.projectId
          }
        },
        update(data) {
          // Not using 'loadingKey' pattern here to avoid getting a full-page loading spinner when the user clicks a
          // button that causes this query to refetch
          this.loaded = true;
          return data;
        }
      },
    }
  })
  export default class ViewProjectPage extends Vue {
    loaded = false;
    isAcceptingInvite = false;
    data: ViewProjectPageData | null = null;

    get currentUserId(): string | null { return this.data && this.data.currentUser && this.data.currentUser.id }
    get project(): ProjectInfo | null { return this.data && this.data.project; }
    get roleInProject(): UserProjectRole | null { return this.data && this.data.project && this.data.project.currentUserRole; }
    get projectDatasets(): DatasetDetailItem[] { return this.data && this.data.allDatasets || []; }
    get countDatasets(): number { return this.data && this.data.countDatasets || 0; }
    maxVisibleDatasets = 8;


    get projectId(): string {
      return this.$route.params.projectId;
    }

    get isInvited(): boolean {
      return this.roleInProject === 'INVITED';
    }

    get datasetsListLink() {
      return {
        path: '/datasets',
        query: this.project && encodeParams({ project: this.projectId })
      }
    }

    @ConfirmAsync({
      title: '',
      message: 'An email will be sent to the project\'s principal investigator to confirm your access.',
      confirmButtonText: "Request access"
    })
    async handleRequestAccess() {
      await this.joinProject();
    }

    async handleAcceptInvite() {
      try {
        this.isAcceptingInvite = true;
        await this.joinProject();
      } catch(err) {
        reportError(err);
      } finally {
        this.isAcceptingInvite = true;
      }
    }

    @ConfirmAsync({
      title: 'Decline invitation',
      message: 'Are you sure?',
      confirmButtonText: "Decline invitation"
    })
    async handleRejectInvite() {
      await this.$apollo.mutate({
        mutation: leaveProjectMutation,
        variables: { projectId: this.projectId },
      });
      await this.$apollo.queries.data.refetch();
    }

    handleManageProject() {
      this.$router.push({
        name: 'edit-project',
        params: {projectId: this.projectId},
      });
    }

    async joinProject() {
      await this.$apollo.mutate({
        mutation: this.isInvited ? acceptProjectInvitationMutation : requestAccessToProjectMutation,
        variables: { projectId: this.projectId },
      });
      await this.$apollo.queries.data.refetch();
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
    width: 820px;

    @media (min-width: 1650px) {
      /* 2 datasets per row on wide screens */
      width: 1620px;
    }
  }

  .header-row {
    display: flex;
    flex-wrap: wrap;
  }
  .header-names {
    display: flex;
    align-items: baseline;
  }
  .header-buttons {
    display: flex;
    justify-content: flex-end;
    flex-grow: 1;
    align-self: center;
    margin-right: 3px;
  }
</style>
