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
        <el-tab-pane name="datasets" :label="'Datasets' | optionalSuffixInParens(countDatasets)" lazy>
          <dataset-list :datasets="projectDatasets.slice(0, maxVisibleDatasets)" @filterUpdate="handleFilterUpdate" />

          <div class="dataset-list-footer">
            <router-link v-if="countDatasets > maxVisibleDatasets" :to="datasetsListLink">See all datasets</router-link>
          </div>
        </el-tab-pane>
        <el-tab-pane name="members" lazy>
          <span slot="label">
            {{'Members' | optionalSuffixInParens(countMembers)}}
            <notification-icon v-if="hasMembershipRequest" />
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
              + {{countHiddenMembers | plural('hidden member', 'hidden members')}}.
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
  import {
    datasetDeletedQuery,
    DatasetDetailItem,
    datasetDetailItemFragment,
  } from '../../api/dataset';
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
  import NotificationIcon from '../../components/NotificationIcon.vue';
  import reportError from '../../lib/reportError';
  import {currentUserRoleQuery, CurrentUserRoleResult} from '../../api/user';
  import isUuid from '../../lib/isUuid';
  import {isArray, throttle} from 'lodash-es';
  import ProjectMembersList from './ProjectMembersList.vue';
  import ProjectSettings from './ProjectSettings.vue';
  import {optionalSuffixInParens, plural} from '../../lib/vueFilters';
  import apolloClient from '../../graphqlClient';
  import {removeDatasetFromAllDatasetsQuery} from '../../lib/updateApolloCache';


  interface ViewProjectPageData {
    allDatasets: DatasetDetailItem[];
    countDatasets: number;
  }

  @Component<ViewProjectPage>({
    components: {
      DatasetList,
      ProjectMembersList,
      ProjectSettings,
      NotificationIcon,
    },
    filters: {
      optionalSuffixInParens,
      plural,
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
              project(projectId: $projectIdOrSlug) { ...ViewProjectFragment hasPendingRequest }
            }
            ${ViewProjectFragment}`;
          } else {
            return gql`query ProjectProfileBySlug($projectIdOrSlug: String!) {
              project: projectByUrlSlug(urlSlug: $projectIdOrSlug) { ...ViewProjectFragment hasPendingRequest }
            }
            ${ViewProjectFragment}`;
          }
        },
        variables() {
          return {projectIdOrSlug: this.$route.params.projectIdOrSlug};
        },
        // Can't be 'no-cache' because `refetchProject` is used for updating the cache, which in turn updates
        // MetaspaceHeader's project.hasPendingRequest notification
        fetchPolicy: 'network-only',
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
        datasetDeleted: {
          query: datasetDeletedQuery,
          result({data}) {
            removeDatasetFromAllDatasetsQuery(this, 'data', data.datasetDeleted.id);
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

    get currentUserId(): string | null { return this.currentUser && this.currentUser.id }
    get roleInProject(): ProjectRole | null { return this.project && this.project.currentUserRole; }
    get projectDatasets(): DatasetDetailItem[] { return this.data && this.data.allDatasets || []; }
    get countDatasets(): number { return this.data && this.data.countDatasets || 0; }
    get members() { return this.project && this.project.members || []; }
    get countMembers() { return this.project && this.project.numMembers; }
    maxVisibleDatasets = 8;

    get projectId(): string | null {
      if (isUuid(this.$route.params.projectIdOrSlug)) {
        return this.$route.params.projectIdOrSlug; // If it's possible to get the ID from the route, use that because it's faster than projectById/projectBySlug.
      } else {
        return this.project && this.project.id
      }
    }

    get tab() {
      if (['datasets', 'members', 'settings'].includes(this.$route.query.tab)) {
        return this.$route.query.tab;
      } else {
        return 'datasets';
      }
    }
    set tab(tab: string) {
      this.$router.replace({ query: { tab } })
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

    @Watch('$route.params.projectIdOrSlug')
    @Watch('project.urlSlug')
    canonicalizeUrl() {
      if (isUuid(this.$route.params.projectIdOrSlug) && this.project != null && this.project.urlSlug) {
        this.$router.replace({
          params: {projectIdOrSlug: this.project.urlSlug},
          query: this.$route.query,
        });
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

  .hidden-members-text {
    text-align: center;
    color: $--color-text-secondary;
  }
</style>
