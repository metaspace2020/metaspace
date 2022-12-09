<template>
  <div
    v-loading="!loaded"
    class="page"
  >
    <div
      v-if="project != null"
      class="page-content"
    >
      <datasets-dialog
        :visible="showProjectDatasetsDialog && currentUser != null"
        :refresh-data="refetch"
        :current-user="currentUser"
        :project="project"
        :is-manager="isManager"
        @close="handleCloseProjectDatasetsDialog"
        @update="handleUpdateProjectDatasetsDialog"
      />
      <div class="header-row">
        <div class="header-names">
          <h1
            class="py-1 leading-tight"
            :class="{ 'mb-0': projectDOI }"
          >
            {{ project.name }}
          </h1>
          <p
            v-if="projectDOI"
            class="mt-0 leading-6 text-sm font-medium"
          >
            Publication:
            <a
              :href="projectDOI"
              class=""
              target="_blank"
              rel="noopener"
            >
              {{ projectDOI }}
            </a>
          </p>
        </div>

        <div class="header-buttons">
          <el-button
            v-if="currentUser != null && roleInProject == null"
            type="primary"
            @click="handleRequestAccess"
          >
            Request access
          </el-button>
          <el-button
            v-if="roleInProject === 'PENDING'"
            disabled
          >
            Request sent
          </el-button>
          <new-feature-badge
            v-if="showManageDataset"
            class="ml-2"
            feature-key="manage_project_datasets"
          >
            <el-button
              @click="handleOpenProjectDatasetsDialog"
            >
              Manage datasets
            </el-button>
          </new-feature-badge>
        </div>
        <el-alert
          v-if="roleInProject === 'INVITED'"
          type="info"
          show-icon
          :closable="false"
          title=""
        >
          <div style="padding: 0 0 20px 20px;">
            <p>
              You have been invited to join {{ project.name }}.
            </p>
            <div>
              <el-button
                type="danger"
                @click="handleRejectInvite"
              >
                Decline invitation
              </el-button>
              <el-button
                type="primary"
                :loading="isAcceptingInvite"
                @click="handleAcceptInvite"
              >
                Join project
              </el-button>
            </div>
          </div>
        </el-alert>
      </div>
      <el-tabs
        v-model="tab"
        class="with-badges"
      >
        <el-tab-pane
          v-if="visibleTabs.includes('about')"
          name="about"
          label="About"
          lazy
        >
          <rich-text
            class="max-w-measure-5 mx-auto mb-6"
            :placeholder="descriptionPlaceholder"
            :content="projectDescription"
            :readonly="!canEdit"
            :update="updateDescription"
          />
        </el-tab-pane>
        <el-tab-pane
          name="datasets"
          :label="'Datasets' | optionalSuffixInParens(countDatasets)"
          lazy
        >
          <dataset-list
            :datasets="projectDatasets.slice(0, maxVisibleDatasets)"
            @filterUpdate="handleFilterUpdate"
          />

          <div class="dataset-list-footer">
            <router-link
              v-if="countDatasets > maxVisibleDatasets"
              :to="datasetsListLink"
            >
              See all datasets
            </router-link>
          </div>
        </el-tab-pane>
        <el-tab-pane
          name="members"
          lazy
        >
          <span slot="label">
            {{ 'Members' | optionalSuffixInParens(countMembers) }}
            <notification-icon v-if="hasMembershipRequest" />
          </span>
          <div style="max-width: 950px">
            <project-members-list
              :loading="projectLoading !== 0"
              :current-user="currentUser"
              :project="project"
              :members="members"
              :refresh-data="refetchProject"
            />
            <p
              v-if="countHiddenMembers > 0"
              class="hidden-members-text"
            >
              + {{ countHiddenMembers | plural('hidden member', 'hidden members') }}.
            </p>
          </div>
        </el-tab-pane>
        <el-tab-pane
          v-if="visibleTabs.includes('publishing')"
          name="publishing"
          class="tab-with-badge sm-publishing-tab"
          lazy
        >
          <span slot="label">
            <new-feature-badge feature-key="scientific_publishing">
              Publishing
            </new-feature-badge>
          </span>
          <publishing
            :current-user-name="currentUserName"
            :project="project"
            :refetch-project="refetchProject"
          />
        </el-tab-pane>
        <el-tab-pane
          v-if="visibleTabs.includes('settings')"
          name="settings"
          label="Settings"
          lazy
        >
          <project-settings :project-id="projectId" />
        </el-tab-pane>
      </el-tabs>
    </div>
    <div v-if="projectLoaded && project == null">
      This project does not exist, or you do not have access to it.
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Watch } from 'vue-property-decorator'
import {
  datasetDeletedQuery,
  DatasetDetailItem,
  datasetDetailItemFragment,
} from '../../api/dataset'
import DatasetList from '../Datasets/list/DatasetList.vue'
import {
  acceptProjectInvitationMutation,
  leaveProjectMutation,
  ProjectRole,
  ProjectRoleOptions,
  requestAccessToProjectMutation, updateProjectMutation, UpdateProjectMutation,
  ViewProjectFragment,
  ViewProjectResult,
} from '../../api/project'
import gql from 'graphql-tag'
import { encodeParams } from '../Filters'
import ConfirmAsync from '../../components/ConfirmAsync'
import confirmPrompt from '../../components/confirmPrompt'
import NotificationIcon from '../../components/NotificationIcon.vue'
import reportError from '../../lib/reportError'
import { currentUserRoleWithGroupQuery, CurrentUserRoleWithGroupResult } from '../../api/user'
import isUuid from '../../lib/isUuid'
import ProjectMembersList from './ProjectMembersList.vue'
import ProjectSettings from './ProjectSettings.vue'
import { optionalSuffixInParens, plural } from '../../lib/vueFilters'
import { removeDatasetFromAllDatasetsQuery } from '../../lib/updateApolloCache'
import RichText from '../../components/RichText'
import Publishing from './publishing'
import NewFeatureBadge, { hideFeatureBadge } from '../../components/NewFeatureBadge'
import { ProjectDatasetsDialog } from '../Project/ProjectDatasetsDialog'
import { DatasetsDialog } from './DatasetsDialog'

  interface ViewProjectPageData {
    allDatasets: DatasetDetailItem[];
    countDatasets: number;
  }

  @Component<ViewProjectPage>({
    components: {
      DatasetsDialog,
      DatasetList,
      ProjectMembersList,
      ProjectSettings,
      NotificationIcon,
      RichText,
      Publishing,
      NewFeatureBadge,
      ProjectDatasetsDialog,
    },
    filters: {
      optionalSuffixInParens,
      plural,
    },
    apollo: {
      currentUser: {
        query: currentUserRoleWithGroupQuery,
        fetchPolicy: 'cache-first',
      },
      project: {
        query() {
          if (isUuid(this.$route.params.projectIdOrSlug)) {
            return gql`query ProjectProfileById($projectIdOrSlug: ID!) {
              project(projectId: $projectIdOrSlug) { ...ViewProjectFragment hasPendingRequest }
            }
            ${ViewProjectFragment}`
          } else {
            return gql`query ProjectProfileBySlug($projectIdOrSlug: String!) {
              project: projectByUrlSlug(urlSlug: $projectIdOrSlug) { ...ViewProjectFragment hasPendingRequest }
            }
            ${ViewProjectFragment}`
          }
        },
        variables() {
          return { projectIdOrSlug: this.$route.params.projectIdOrSlug }
        },
        update(data) {
          this.projectLoaded = true
          return data.project
        },
        // Can't be 'no-cache' because `refetchProject` is used for updating the cache, which in turn updates
        // MetaspaceHeader's project.hasPendingRequest notification
        fetchPolicy: 'network-only',
        loadingKey: 'projectLoading',
      },
      data: {
        query: gql`query ProjectProfileDatasets(
          $projectId: ID!,
          $maxVisibleDatasets: Int!,
          $inpFdrLvls: [Int!] = [10],
          $checkLvl: Int = 10
        ) {
          allDatasets(offset: 0, limit: $maxVisibleDatasets, filter: { project: $projectId }) {
            ...DatasetDetailItem
          }
          countDatasets(filter: { project: $projectId })
        }

        ${datasetDetailItemFragment}`,
        variables() {
          return {
            maxVisibleDatasets: this.maxVisibleDatasets,
            projectId: this.projectId,
          }
        },
        update(data) {
          // Not using 'loadingKey' pattern here to avoid getting a full-page loading spinner when the user clicks a
          // button that causes this query to refetch.
          this.loaded = true
          return data
        },
        skip() {
          const skip = this.projectId == null
          if (skip) {
            this.loaded = true
          }
          return skip
        },
      },
      $subscribe: {
        datasetDeleted: {
          query: datasetDeletedQuery,
          result({ data }) {
            removeDatasetFromAllDatasetsQuery(this, 'data', data.datasetDeleted.id)
          },
        },
      },
    },
  })
export default class ViewProjectPage extends Vue {
    projectLoading = 0;
    projectLoaded = false;
    loaded = false;
    isAcceptingInvite = false;
    currentUser: CurrentUserRoleWithGroupResult | null = null;
    project: ViewProjectResult | null = null;
    data: ViewProjectPageData | null = null;
    showProjectDatasetsDialog: boolean = false;

    get currentUserId(): string | null { return this.currentUser && this.currentUser.id }
    get roleInProject(): ProjectRole | null { return this.project && this.project.currentUserRole }
    get showManageDataset(): boolean {
      const canEditRole = this.currentUser && (this.project?.currentUserRole === ProjectRoleOptions.MANAGER
        || this.project?.currentUserRole === ProjectRoleOptions.MEMBER || this.currentUser.role === 'admin')
      return !!(this.currentUser && this.currentUser.id
        && canEditRole && this.$route?.query?.tab === 'datasets')
    }

    get currentUserName() {
      if (this.currentUser && this.currentUser.name) {
        return this.currentUser.name
      }
      return ''
    }

    get projectDatasets(): DatasetDetailItem[] {
      return (this.data && this.data.allDatasets || []).filter(ds => ds.status !== 'FAILED')
    }

    get countDatasets(): number { return this.data && this.data.countDatasets || 0 }
    get members() { return this.project && this.project.members || [] }
    get countMembers() { return this.project && this.project.numMembers }
    maxVisibleDatasets = 8;

    get projectId(): string | null {
      if (isUuid(this.$route.params.projectIdOrSlug)) {
        return this.$route.params.projectIdOrSlug // If it's possible to get the ID from the route, use that because it's faster than projectById/projectBySlug.
      } else {
        return this.project && this.project.id
      }
    }

    // extra protection in case `projectDescription` is omitted
    get projectDescription() {
      if (this.project && this.project.projectDescription) {
        return this.project.projectDescription
      }
      return null
    }

    get visibleTabs() {
      if (this.project === null) {
        return []
      }
      if (this.canEdit) {
        return ['about', 'datasets', 'members', 'publishing', 'settings']
      }
      if (this.project && this.project.projectDescription !== null) {
        return ['about', 'datasets', 'members']
      }
      return ['datasets', 'members']
    }

    get tab(): string | null {
      const tabs = this.visibleTabs
      if (tabs.length === 0) {
        return null
      }
      const selectedTab = this.$route.query.tab
      if (tabs.includes(selectedTab)) {
        return selectedTab
      }
      if (selectedTab !== undefined) {
        this.tab = tabs[0]
      }
      return tabs[0]
    }

    set tab(tab: string | null) {
      if (tab !== null && this.visibleTabs.includes(tab)) {
        this.$router.replace({ query: { tab } })
      }
    }

    @Watch('tab')
    checkFeatureBadges() {
      if (this.tab === 'publishing') {
        hideFeatureBadge('scientific_publishing')
      }
    }

    get isInvited(): boolean {
      return this.roleInProject === 'INVITED'
    }

    get datasetsListLink() {
      return {
        path: '/datasets',
        query: this.projectId && encodeParams({ project: this.projectId }),
      }
    }

    get canEdit() {
      return this.roleInProject === ProjectRoleOptions.MANAGER
        || (this.currentUser && this.currentUser.role === 'admin')
    }

    get isManager() {
      return this.currentUser
        && (this.roleInProject === ProjectRoleOptions.MANAGER || this.currentUser.role === 'admin')
    }

    get countHiddenMembers() {
      if (this.countMembers != null) {
        return Math.max(0, this.countMembers - this.members.length)
      } else {
        return 0
      }
    }

    get hasMembershipRequest() {
      return this.members.some(m => m.role === ProjectRoleOptions.PENDING)
    }

    get projectDOI() {
      if (this.project !== null) {
        for (const item of this.project.externalLinks) {
          if (item.provider === 'DOI') {
            return item.link
          }
        }
      }
      return null
    }

    @Watch('$route.params.projectIdOrSlug')
    @Watch('project.urlSlug')
    canonicalizeUrl() {
      if (
        this.project !== null
        && this.projectId !== null
        && this.$route.params.projectIdOrSlug !== this.project.urlSlug
      ) {
        this.$router.replace({
          params: { projectIdOrSlug: this.project.urlSlug || this.projectId },
          query: this.$route.query,
        })
      }
    }

    @ConfirmAsync({
      title: '',
      message: 'An email will be sent to the project\'s manager to confirm your access.',
      confirmButtonText: 'Request access',
    })
    async handleRequestAccess() {
      await this.joinProject()
    }

    async handleAcceptInvite() {
      try {
        this.isAcceptingInvite = true
        await this.joinProject()
      } catch (err) {
        reportError(err)
      } finally {
        this.isAcceptingInvite = true
      }
    }

    @ConfirmAsync({
      title: 'Decline invitation',
      message: 'Are you sure?',
      confirmButtonText: 'Decline invitation',
    })
    async handleRejectInvite() {
      await this.$apollo.mutate({
        mutation: leaveProjectMutation,
        variables: { projectId: this.projectId },
      })
      await this.refetch()
    }

    handleFilterUpdate(newFilter: any) {
      this.$store.commit('updateFilter', {
        ...newFilter,
        project: this.projectId,
      })

      this.$router.push({
        path: '/datasets',
        query: this.$route.query,
      })
    }

    async joinProject() {
      await this.$apollo.mutate({
        mutation: this.isInvited ? acceptProjectInvitationMutation : requestAccessToProjectMutation,
        variables: { projectId: this.projectId },
      })
      await this.refetch()
    }

    get descriptionPlaceholder() {
      if (this.canEdit) {
        return 'Describe this project …'
      }
      return 'Project has no description.'
    }

    async updateDescription(newProjectDescription: string) {
      await this.$apollo.mutate<UpdateProjectMutation>({
        mutation: updateProjectMutation,
        variables: {
          projectId: this.projectId,
          projectDetails: {
            projectDescription: newProjectDescription,
          },
        },
      })
      this.refetchProject()
    }

    async refetchProject() {
      await this.$apollo.queries.project.refetch()
    }

    async refetch() {
      return Promise.all([
        this.$apollo.queries.project.refetch(),
        this.$apollo.queries.data.refetch(),
      ])
    }

    handleOpenProjectDatasetsDialog() {
      this.showProjectDatasetsDialog = true
      hideFeatureBadge('manage_project_datasets')
    }

    handleCloseProjectDatasetsDialog() {
      this.showProjectDatasetsDialog = false
    }

    handleUpdateProjectDatasetsDialog() {
      this.showProjectDatasetsDialog = false
      // TODO: Remove
      window.location.reload()
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
    margin-left: 20px;
    margin-right: 20px;
  }

  .header-row {
    display: flex;
    flex-wrap: wrap;
  }

  .header-buttons {
    display: flex;
    justify-content: flex-end;
    flex-grow: 1;
    align-self: center;
    margin-right: 3px;
  }

  .hidden-members-text {
    @apply text-gray-600;
    text-align: center;
  }
</style>
<style>
  .el-tab-pane.sm-publishing-tab {
    margin-top: 24px;
  }
</style>
