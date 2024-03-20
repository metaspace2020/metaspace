<template>
  <div v-loading="!isLoaded" class="page">
    <div v-if="project != null" class="page-content">
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
          <h1 class="py-1 leading-tight" :class="{ 'mb-0': projectDOI }">
            {{ project.name }}
          </h1>
          <p v-if="projectDOI" class="mt-0 leading-6 text-sm font-medium">
            Publication:
            <a :href="projectDOI" class="" target="_blank" rel="noopener">
              {{ projectDOI }}
            </a>
          </p>
        </div>

        <div class="header-buttons">
          <el-button v-if="currentUser != null && roleInProject == null" type="primary" @click="handleRequestAccess">
            Request access
          </el-button>
          <el-button v-if="roleInProject === 'PENDING'" disabled> Request sent </el-button>
          <new-feature-badge v-if="showManageDataset" custom-class="ml-2" feature-key="manage_project_datasets">
            <el-button @click="handleOpenProjectDatasetsDialog"> Manage datasets </el-button>
          </new-feature-badge>
        </div>
        <el-alert v-if="roleInProject === 'INVITED'" type="info" show-icon :closable="false" title="">
          <div style="padding: 0 0 20px 20px">
            <p>You have been invited to join {{ project.name }}.</p>
            <div>
              <el-button type="danger" @click="handleRejectInvite"> Decline invitation </el-button>
              <el-button type="primary" :loading="isAcceptingInvite" @click="handleAcceptInvite">
                Join project
              </el-button>
            </div>
          </div>
        </el-alert>
      </div>
      <el-tabs :model-value="tab" class="with-badges" @update:model-value="setTab">
        <el-tab-pane v-if="visibleTabs.includes('about')" name="about" label="About" lazy>
          <rich-text
            class="max-w-measure-5 mx-auto mb-6"
            :placeholder="descriptionPlaceholder"
            :content="projectDescription"
            :readonly="!canEdit"
            :update="updateDescription"
          />
        </el-tab-pane>
        <el-tab-pane name="datasets" :label="optionalSuffixInParens('Datasets', countDatasets)" lazy>
          <dataset-list :datasets="projectDatasets.slice(0, maxVisibleDatasets)" @filterUpdate="handleFilterUpdate" />

          <div class="dataset-list-footer">
            <router-link v-if="countDatasets > maxVisibleDatasets" :to="datasetsListLink">
              See all datasets
            </router-link>
          </div>
        </el-tab-pane>
        <el-tab-pane name="members" lazy>
          <template v-slot:label>
            <span>
              {{ optionalSuffixInParens('Members', countMembers) }}
              <notification-icon v-if="hasMembershipRequest" />
            </span>
          </template>
          <div style="max-width: 950px">
            <project-members-list
              :loading="projectLoading"
              :current-user="currentUser"
              :project="project"
              :members="members"
              :refresh-data="refetchProject"
            />
            <p v-if="countHiddenMembers > 0" class="hidden-members-text">
              + {{ plural(countHiddenMembers, 'hidden member', 'hidden members') }}.
            </p>
          </div>
        </el-tab-pane>
        <el-tab-pane
          v-if="visibleTabs.includes('publishing')"
          name="publishing"
          class="tab-with-badge sm-publishing-tab"
          lazy
        >
          <template v-slot:label>
            <span>
              <new-feature-badge feature-key="scientific_publishing"> Publishing </new-feature-badge>
            </span>
          </template>
          <publishing :current-user-name="currentUserName" :project="project" :refetch-project="refetchProject" />
        </el-tab-pane>
        <el-tab-pane v-if="visibleTabs.includes('settings')" name="settings" label="Settings" lazy>
          <project-settings :project-id="projectId" />
        </el-tab-pane>
      </el-tabs>
    </div>
    <div v-if="isLoaded && project == null">This project does not exist, or you do not have access to it.</div>
    <div v-else-if="!isLoaded && project == null">
      <el-icon class="is-loading"><Loading /></el-icon>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch, onMounted, computed, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { ElButton, ElAlert, ElTabs, ElTabPane, ElLoading } from '../../lib/element-plus'
import DatasetList from '../Datasets/list/DatasetList.vue'
import { datasetDeletedQuery, DatasetDetailItem, datasetDetailItemFragment } from '../../api/dataset'
import {
  acceptProjectInvitationMutation,
  leaveProjectMutation,
  ProjectRoleOptions,
  requestAccessToProjectMutation,
  updateProjectMutation,
  ViewProjectFragment,
  ViewProjectResult,
} from '../../api/project'
import { currentUserRoleWithGroupQuery, CurrentUserRoleWithGroupResult } from '../../api/user'
import gql from 'graphql-tag'
import { encodeParams } from '../Filters'
import { useConfirmAsync } from '../../components/ConfirmAsync'
import NotificationIcon from '../../components/NotificationIcon.vue'
import reportError from '../../lib/reportError'
import isUuid from '../../lib/isUuid'
import ProjectMembersList from './ProjectMembersList.vue'
import ProjectSettings from './ProjectSettings.vue'
import { optionalSuffixInParens, plural } from '../../lib/vueFilters'
import { removeDatasetFromAllDatasetsQuery } from '../../lib/updateApolloCache'
import RichText from '../../components/RichText'
import Publishing from './publishing'
import NewFeatureBadge, { hideFeatureBadge } from '../../components/NewFeatureBadge'
import DatasetsDialog from './DatasetsDialog'
import { DefaultApolloClient, useQuery, useSubscription } from '@vue/apollo-composable'
import { ElIcon } from '../../lib/element-plus'
import { Loading } from '@element-plus/icons-vue'
interface ViewProjectPageData {
  allDatasets: DatasetDetailItem[]
  countDatasets: number
}

export default defineComponent({
  components: {
    ElButton,
    ElAlert,
    ElTabs,
    ElTabPane,
    DatasetList,
    DatasetsDialog,
    ProjectMembersList,
    ProjectSettings,
    NotificationIcon,
    RichText,
    Publishing,
    NewFeatureBadge,
    ElIcon,
    Loading,
  },
  directives: {
    loading: ElLoading.directive,
  },
  setup() {
    const router = useRouter()
    const route = useRoute()
    const store = useStore()
    const confirmAsync = useConfirmAsync()
    const apolloClient = inject(DefaultApolloClient)
    const tab = ref(null as string | null)

    const projectLoaded = ref(false)
    const loaded = ref(false)
    const isAcceptingInvite = ref(false)
    const showProjectDatasetsDialog = ref(false)
    const maxVisibleDatasets = ref(8)

    const projectQuery = computed(() => {
      if (isUuid(route.params.projectIdOrSlug as string)) {
        return gql`
          query ProjectProfileById($projectIdOrSlug: ID!) {
            project(projectId: $projectIdOrSlug) {
              ...ViewProjectFragment
              hasPendingRequest
            }
          }
          ${ViewProjectFragment}
        `
      } else {
        return gql`
          query ProjectProfileBySlug($projectIdOrSlug: String!) {
            project: projectByUrlSlug(urlSlug: $projectIdOrSlug) {
              ...ViewProjectFragment
              hasPendingRequest
            }
          }
          ${ViewProjectFragment}
        `
      }
    })

    const { result: currentUserResult } = useQuery(currentUserRoleWithGroupQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser as CurrentUserRoleWithGroupResult | null)

    const {
      result: projectResult,
      onResult: onProjectResult,
      refetch: refetchProject,
      loading: projectLoading,
    } = useQuery(
      projectQuery.value,
      { projectIdOrSlug: route.params.projectIdOrSlug },
      {
        // Can't be 'no-cache' because `refetchProject` is used for updating the cache, which in turn updates
        // MetaspaceHeader's project.hasPendingRequest notification
        fetchPolicy: 'network-only',
      }
    )
    onProjectResult(() => {
      setTimeout(() => {
        projectLoaded.value = true
      }, 300)
    })
    const project = computed(() => projectResult.value?.project as ViewProjectResult | null)
    const projectId = computed((): string | null => {
      if (isUuid(route.params.projectIdOrSlug as string)) {
        return route.params.projectIdOrSlug as string // If it's possible to get the ID from the route, use that because it's faster than projectById/projectBySlug.
      } else {
        return project.value && project.value?.id
      }
    })

    const {
      result: dataResult,
      onResult: onDataResult,
      refetch: refetchData,
    } = useQuery(
      gql`
        query ProjectProfileDatasets(
          $projectId: ID!
          $maxVisibleDatasets: Int!
          $inpFdrLvls: [Int!] = [10]
          $checkLvl: Int = 10
        ) {
          allDatasets(offset: 0, limit: $maxVisibleDatasets, filter: { project: $projectId }) {
            ...DatasetDetailItem
          }
          countDatasets(filter: { project: $projectId })
        }

        ${datasetDetailItemFragment}
      `,
      {
        maxVisibleDatasets: maxVisibleDatasets.value,
        projectId: projectId.value,
      },
      {
        enabled: computed(() => projectId.value != null),
      }
    )
    onDataResult(() => {
      setTimeout(() => {
        loaded.value = true
      }, 300)
    })
    const data = computed(() => dataResult.value as ViewProjectPageData | null)

    const { onResult } = useSubscription(datasetDeletedQuery)

    onResult(({ data }) => {
      if (data && data.datasetDeleted) {
        removeDatasetFromAllDatasetsQuery('data', data.datasetDeleted.id)
      }
    })

    const currentUserId = computed(() => currentUser.value?.id)
    const roleInProject = computed(() => project.value?.currentUserRole)
    const showManageDataset = computed((): boolean => {
      const canEditRole =
        currentUser.value &&
        (project.value?.currentUserRole === ProjectRoleOptions.MANAGER ||
          project.value?.currentUserRole === ProjectRoleOptions.MEMBER ||
          currentUser.value?.role === 'admin')
      return !!(currentUser.value && currentUser.value?.id && canEditRole && route?.query?.tab === 'datasets')
    })
    const currentUserName = computed((): string => {
      if (currentUser.value && currentUser.value?.name) {
        return currentUser.value?.name
      }
      return ''
    })
    const projectDatasets = computed((): DatasetDetailItem[] =>
      (data.value?.allDatasets || []).filter((ds) => ds.status !== 'FAILED')
    )
    const countDatasets = computed((): number => data.value?.countDatasets || 0)
    const members = computed(() => project.value?.members || [])
    const countMembers = computed(() => project.value?.numMembers || 0)
    const projectDescription = computed(() => project.value?.projectDescription)
    const canEdit = computed(() => {
      return (
        roleInProject.value === ProjectRoleOptions.MANAGER || (currentUser.value && currentUser.value?.role === 'admin')
      )
    })
    const visibleTabs = computed(() => {
      if (project.value === null) {
        return []
      }
      if (canEdit.value) {
        return ['about', 'datasets', 'members', 'publishing', 'settings']
      }
      if (project.value && project.value?.projectDescription !== null) {
        return ['about', 'datasets', 'members']
      }
      return ['datasets', 'members']
    })
    const setTab = (newTab: string | null) => {
      if (newTab !== null && visibleTabs.value.includes(newTab)) {
        router.replace({ query: { tab: newTab } })
        tab.value = newTab
      }
    }
    const initializeTab = (): string | null => {
      const tabs = visibleTabs.value
      if (tabs.length === 0) {
        setTab(null)
      }
      const selectedTab = route.query.tab as string

      if (tabs.includes(selectedTab)) {
        setTab(selectedTab)
      }
      if (selectedTab === undefined) {
        setTab(tabs[0])
      }
      return tabs[0]
    }
    const isLoaded = computed(() => projectLoaded.value && loaded.value)
    const checkFeatureBadges = () => {
      if (tab.value === 'publishing') {
        hideFeatureBadge('scientific_publishing')
      }
    }

    const isInvited = computed(() => roleInProject.value === ProjectRoleOptions.INVITED)

    const datasetsListLink = computed(() => ({
      path: '/datasets',
      query: projectId.value && encodeParams({ project: projectId.value }),
    }))

    const isManager = computed(
      () => roleInProject.value === ProjectRoleOptions.MANAGER || currentUser.value?.role === 'admin'
    )
    const countHiddenMembers = computed(() => {
      if (countMembers.value != null) {
        return Math.max(0, countMembers.value - members.value.length)
      } else {
        return 0
      }
    })
    const projectDOI = computed(() => {
      if (project.value !== null && Array.isArray(project.value.externalLinks)) {
        // eslint-disable-next-line no-unsafe-optional-chaining
        for (const item of project.value?.externalLinks) {
          if (item.provider === 'DOI') {
            return item.link
          }
        }
      }
      return null
    })
    const hasMembershipRequest = computed(() => members.value?.some((m) => m.role === ProjectRoleOptions.PENDING))
    const descriptionPlaceholder = computed(() => {
      if (canEdit.value) {
        return 'Describe this project …'
      }
      return 'Project has no description.'
    })

    const canonicalizeUrl = () => {
      if (
        project.value !== null &&
        projectId.value !== null &&
        route.params.projectIdOrSlug !== project.value?.urlSlug
      ) {
        router.replace({
          params: { projectIdOrSlug: project.value?.urlSlug || projectId.value },
          query: route.query,
        })
      }
    }

    watch(tab, () => {
      checkFeatureBadges()
    })

    onMounted(() => {
      initializeTab()
    })

    const refetch = async () => {
      return Promise.all([refetchProject(), refetchData()])
    }

    const handleOpenProjectDatasetsDialog = () => {
      showProjectDatasetsDialog.value = true
      hideFeatureBadge('manage_project_datasets')
    }
    const handleCloseProjectDatasetsDialog = () => {
      showProjectDatasetsDialog.value = false
    }
    const handleUpdateProjectDatasetsDialog = () => {
      showProjectDatasetsDialog.value = false
      // TODO: Remove
      window.location.reload()
    }

    const joinProject = async () => {
      await apolloClient.mutate({
        mutation: isInvited.value ? acceptProjectInvitationMutation : requestAccessToProjectMutation,
        variables: { projectId: projectId.value },
      })
      await refetch()
    }

    const updateDescription = async (newProjectDescription: string) => {
      await apolloClient.mutate({
        mutation: updateProjectMutation,
        variables: {
          projectId: projectId.value,
          projectDetails: {
            projectDescription: newProjectDescription,
          },
        },
      })
      await refetchProject()
    }

    const handleRequestAccess = async () => {
      const confirmOptions = {
        title: '',
        message: "An email will be sent to the project's manager to confirm your access.",
        confirmButtonText: 'Request access',
      }

      await confirmAsync(confirmOptions, async () => {
        await joinProject()
      })
    }

    const handleRejectInvite = async () => {
      const confirmOptions = {
        title: 'Decline invitation',
        message: 'Are you sure?',
        confirmButtonText: 'Decline invitation',
      }

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: leaveProjectMutation,
          variables: { projectId: projectId.value },
        })
        await refetch()
      })
    }

    const handleAcceptInvite = async () => {
      try {
        isAcceptingInvite.value = true
        await joinProject()
      } catch (err) {
        reportError(err)
      } finally {
        isAcceptingInvite.value = true
      }
    }

    const handleFilterUpdate = (newFilter: any) => {
      store.commit('updateFilter', {
        ...newFilter,
        project: projectId.value,
      })

      router.push({
        path: '/datasets',
        query: route.query,
      })
    }

    const projectIdOrSlug = computed(() => route.params?.projectIdOrSlug || project.value?.urlSlug)

    watch(projectIdOrSlug, () => {
      canonicalizeUrl()
    })

    watch(visibleTabs, () => {
      initializeTab()
    })

    return {
      projectLoading,
      projectLoaded,
      loaded,
      isAcceptingInvite,
      currentUserId,
      roleInProject,
      handleRequestAccess,
      tab,
      plural,
      project,
      projectId,
      projectIdOrSlug,
      showProjectDatasetsDialog,
      maxVisibleDatasets,
      currentUser,
      data,
      showManageDataset,
      currentUserName,
      projectDatasets,
      countDatasets,
      members,
      countMembers,
      projectDescription,
      visibleTabs,
      isInvited,
      datasetsListLink,
      canEdit,
      isManager,
      countHiddenMembers,
      hasMembershipRequest,
      projectDOI,
      refetch,
      handleAcceptInvite,
      handleRejectInvite,
      handleFilterUpdate,
      updateDescription,
      refetchProject,
      handleOpenProjectDatasetsDialog,
      handleCloseProjectDatasetsDialog,
      handleUpdateProjectDatasetsDialog,
      optionalSuffixInParens,
      descriptionPlaceholder,
      isLoaded,
      setTab,
    }
  },
})
</script>

<style scoped lang="scss">
@import 'element-plus/theme-chalk/src/mixins/mixins';

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
