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
      <el-tabs v-model="tab">
        <el-tab-pane name="datasets" :label="`Datasets${parenthesize(countDatasets)}`" lazy>
          <dataset-list :datasets="projectDatasets.slice(0, maxVisibleDatasets)" @filterUpdate="handleFilterUpdate" />

          <div class="dataset-list-footer">
            <router-link v-if="countDatasets > maxVisibleDatasets" :to="datasetsListLink">See all datasets</router-link>
          </div>
        </el-tab-pane>
        <el-tab-pane name="members" lazy>
          <span slot="label">
            Members{{parenthesize(countMembers)}}
            <i v-if="hasMembershipRequest" class="el-icon-message notification" />
          </span>
          <div style="max-width: 950px">
            <project-members-list
              :loading="projectLoading !== 0"
              :currentUser="currentUser"
              :project="project"
              :members="members"
              :refreshData="refetchProject"
            />
            <p v-if="countHiddenMembers > 0" class="hidden-members-text">
              + {{countHiddenMembers}} hidden member{{countHiddenMembers !== 1 ? 's' : ''}}.
            </p>
          </div>
        </el-tab-pane>
        <el-tab-pane name="settings" label="Settings" v-if="canEdit && projectId != null" lazy>
          <project-settings :projectId="projectId" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import {Component, Watch} from 'vue-property-decorator';
  import {DatasetDetailItem, datasetDetailItemFragment, datasetStatusUpdatedQuery} from '../../api/dataset';
  import DatasetList from '../Datasets/list/DatasetList.vue';
  import {
    acceptProjectInvitationMutation,
    leaveProjectMutation,
    ProjectRole,
    ProjectRoleOptions,
    requestAccessToProjectMutation,
    ViewProjectFragment,
    ViewProjectResult,
  } from '../../api/project';
  import gql from 'graphql-tag';
  import {encodeParams} from '../Filters';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import reportError from '../../lib/reportError';
  import {currentUserRoleQuery, CurrentUserRoleResult} from '../../api/user';
  import isUuid from '../../lib/isUuid';
  import {throttle} from 'lodash-es';
  import ProjectMembersList from './ProjectMembersList.vue';
  import ProjectSettings from './ProjectSettings.vue';


  interface ViewProjectPageData {
    allDatasets: DatasetDetailItem[];
    countDatasets: number;
  }

  @Component<ViewProjectPage>({
    components: {
      DatasetList,
      ProjectMembersList,
      ProjectSettings,
    },
    apollo: {
      currentUser: {
        query: currentUserRoleQuery,
        fetchPolicy: 'cache-first',
      },
      project: {
        query() {
          if (isUuid(this.$route.params.projectIdOrSlug)) {
            return gql`query ProjectProfileById($projectIdOrSlug: ID!) {
              project(projectId: $projectIdOrSlug) { ...ViewProjectFragment }
            }
            ${ViewProjectFragment}`;
          } else {
            return gql`query ProjectProfileBySlug($projectIdOrSlug: String!) {
              project: projectByUrlSlug(urlSlug: $projectIdOrSlug) { ...ViewProjectFragment }
            }
            ${ViewProjectFragment}`;
          }
        },
        variables() {
          return {projectIdOrSlug: this.$route.params.projectIdOrSlug};
        },
        loadingKey: 'projectLoading'
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
            this.refetchDatasets();
          }
        }
      },
    }
  })
  export default class ViewProjectPage extends Vue {
    projectLoading = 0;
    loaded = false;
    isAcceptingInvite = false;
    currentUser: CurrentUserRoleResult | null = null;
    project: ViewProjectResult | null = null;
    data: ViewProjectPageData | null = null;
    tab: string = 'datasets';

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

    get canEdit() {
      return this.roleInProject === ProjectRoleOptions.MANAGER
        || (this.currentUser && this.currentUser.role === 'admin');
    }

    get countMembers() {
      if (this.project != null && this.project.currentUserRole === ProjectRoleOptions.MANAGER) {
        return this.members.length;
      } else if (this.project != null) {
        return this.project.numMembers; // May be out of sync with members list because not everybody can see every member
      } else {
        return null;
      }
    }

    get members() {
      return this.project && this.project.members || [];
    }

    get countHiddenMembers() {
      if (this.countMembers != null) {
        return Math.max(0, this.countMembers - this.members.length);
      } else {
        return 0;
      }
    }

    get hasMembershipRequest() {
      return this.members.some(m => m.role === ProjectRoleOptions.PENDING);
    }

    created() {
      this.refetchDatasets = throttle(this.refetchDatasets, 60000);
      if (['datasets', 'members', 'settings'].includes(this.$route.query.tab)) {
        this.tab = this.$route.query.tab;
      }
    }
    beforeDestroy() {
      (this.refetchDatasets as any).cancel();
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

    parenthesize(content: any) {
      if(content != null && content != '') {
        return ` (${String(content)})`;
      } else {
        return '';
      }
    }

    @ConfirmAsync({
      title: '',
      message: 'An email will be sent to the project\'s manager to confirm your access.',
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

    handleFilterUpdate(newFilter: any) {
      this.$store.commit('updateFilter', {
        ...newFilter,
        project: this.projectId
      });

      this.$router.push({
        path: '/datasets',
        query: this.$route.query,
      })
    }

    async joinProject() {
      await this.$apollo.mutate({
        mutation: this.isInvited ? acceptProjectInvitationMutation : requestAccessToProjectMutation,
        variables: { projectId: this.projectId },
      });
      await this.refetch();
    }

    refetchDatasets() { // This method is wrapped in _.throttle in this.created()
      this.$apollo.queries.data.refetch();
    }

    async refetchProject() {
      await this.$apollo.queries.project.refetch();
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
  @import "~element-ui/packages/theme-chalk/src/common/var";

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

  .member {
    position: relative;
    border-radius: 5px;
    width: 100%;
    max-width: 800px;
    margin: 8px 0;
    padding: 10px;
    border: 1px solid #cce4ff;
    box-sizing: border-box;

    .item-body {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      > * {
        z-index: 1;
      }
    }
    .info-line {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  .notification {
    margin-left: 4px;
    vertical-align: middle;
    color: $--color-danger;
  }

  .hidden-members-text {
    text-align: center;
    color: $--color-text-secondary;
  }
</style>
