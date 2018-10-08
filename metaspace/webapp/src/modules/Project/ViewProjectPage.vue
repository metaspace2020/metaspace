<template>
  <div v-loading="!loaded" class="page">
    <div v-if="project != null" class="page-content">
      <div class="header-row">
        <div class="header-names">
          <h1>{{project.name}}</h1>
        </div>

        <div class="header-buttons">
          <el-button v-if="currentUser != null && roleInProject == null"
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

        <dataset-list :datasets="projectDatasets.slice(0, maxVisibleDatasets)" />

        <div class="dataset-list-footer">
          <router-link v-if="countDatasets > maxVisibleDatasets" :to="datasetsListLink">See all datasets</router-link>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component, Watch } from 'vue-property-decorator';
  import {DatasetDetailItem, datasetDetailItemFragment, datasetStatusUpdatedQuery} from '../../api/dataset';
  import DatasetList from '../Datasets/list/DatasetList.vue';
  import { acceptProjectInvitationMutation, leaveProjectMutation, requestAccessToProjectMutation, ProjectRole } from '../../api/project';
  import gql from 'graphql-tag';
  import { encodeParams } from '../Filters';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import reportError from '../../lib/reportError';
  import { currentUserIdQuery, CurrentUserIdResult } from '../../api/user';
  import isUuid from '../../lib/isUuid';


  interface ProjectInfo {
    id: string;
    name: string;
    urlSlug: string | null;
    currentUserRole: ProjectRole | null;
  }
  const projectInfoFragment = gql`fragment ProjectInfoFragment on Project {
    id
    name
    urlSlug
    currentUserRole
  }`;

  interface ViewProjectPageData {
    allDatasets: DatasetDetailItem[];
    countDatasets: number;
  }

  @Component<ViewProjectPage>({
    components: {
      DatasetList,
    },
    apollo: {
      currentUser: {
        query: currentUserIdQuery,
        fetchPolicy: 'cache-first',
      },
      project: {
        query() {
          if (isUuid(this.$route.params.projectIdOrSlug)) {
            return gql`query ProjectProfileById($projectIdOrSlug: ID!) {
              project(projectId: $projectIdOrSlug) { ...ProjectInfoFragment }
            }
            ${projectInfoFragment}`;
          } else {
            return gql`query ProjectProfileBySlug($projectIdOrSlug: String!) {
              project: projectByUrlSlug(urlSlug: $projectIdOrSlug) { ...ProjectInfoFragment }
            }
            ${projectInfoFragment}`;
          }
        },
        variables() {
          return {projectIdOrSlug: this.$route.params.projectIdOrSlug};
        }
      },
      data: {
        query: gql`query ProjectProfileDatasets($projectId: ID!, $maxVisibleDatasets: Int!, $inpFdrLvls: [Int!] = [10], $checkLvl: Int = 10) {
          allDatasets(offset: 0, limit: $maxVisibleDatasets, filter: { project: $projectId }) {
            ...DatasetDetailItem
          }
          countDatasets(filter: { project: $projectId })
        }

        ${datasetDetailItemFragment}`,
        variables() {
          return {
            maxVisibleDatasets: this.maxVisibleDatasets,
            projectId: this.projectId
          }
        },
        update(data) {
          // Not using 'loadingKey' pattern here to avoid getting a full-page loading spinner when the user clicks a
          // button that causes this query to refetch.
          this.loaded = true;
          return data;
        },
        skip() {
          return this.projectId == null
        }
      },
      $subscribe: {
        datasetStatusUpdated: {
          query: datasetStatusUpdatedQuery,
          result({data}: any) {
            // TODO: Fix websocket authentication so that this can filter out irrelevant status updates
            // const dataset = data.datasetStatusUpdated.dataset;
            // if (dataset != null && dataset.projects != null && dataset.projects.some((p: any) => p.id === this.projectId)) {
            //   this.$apollo.queries.data.refetch();
            // }
            this.$apollo.queries.data.refetch();
          }
        }
      },
    }
  })
  export default class ViewProjectPage extends Vue {
    loaded = false;
    isAcceptingInvite = false;
    currentUser: CurrentUserIdResult | null = null;
    project: ProjectInfo | null = null;
    data: ViewProjectPageData | null = null;

    get currentUserId(): string | null { return this.currentUser && this.currentUser.id }
    get roleInProject(): ProjectRole | null { return this.project && this.project.currentUserRole; }
    get projectDatasets(): DatasetDetailItem[] { return this.data && this.data.allDatasets || []; }
    get countDatasets(): number { return this.data && this.data.countDatasets || 0; }
    maxVisibleDatasets = 8;

    get projectId(): string | null {
      if (isUuid(this.$route.params.projectIdOrSlug)) {
        return this.$route.params.projectIdOrSlug; // If it's possible to get the ID from the route, use that because it's faster than projectById/projectBySlug.
      } else {
        return this.project && this.project.id
      }
    }

    get isInvited(): boolean {
      return this.roleInProject === 'INVITED';
    }

    get datasetsListLink() {
      return {
        path: '/datasets',
        query: this.projectId && encodeParams({ project: this.projectId })
      }
    }

    @Watch('$route.params.projectIdOrSlug')
    @Watch('project.urlSlug')
    canonicalizeUrl() {
      if (isUuid(this.$route.params.projectIdOrSlug) && this.project != null && this.project.urlSlug) {
        this.$router.replace({
          params: {projectIdOrSlug: this.project.urlSlug}
        })
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
      await this.refetch();
    }

    handleManageProject() {
      if (this.projectId != null) {
        this.$router.push({
          name: 'edit-project',
          params: { projectId: this.projectId },
        });
      }
    }

    async joinProject() {
      await this.$apollo.mutate({
        mutation: this.isInvited ? acceptProjectInvitationMutation : requestAccessToProjectMutation,
        variables: { projectId: this.projectId },
      });
      await this.refetch();
    }

    async refetch() {
      return await Promise.all([
        this.$apollo.queries.project.refetch(),
        this.$apollo.queries.data.refetch(),
      ]);
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
