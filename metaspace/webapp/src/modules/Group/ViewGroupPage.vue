<template>
  <div v-loading="!loaded" class="page">
    <div v-if="group != null" class="page-content">
      <transfer-datasets-dialog
        v-if="showTransferDatasetsDialog"
        :group-name="group.name"
        :is-invited="isInvited"
        @accept="handleAcceptTransferDatasets"
        @close="handleCloseTransferDatasetsDialog"
      />
      <requested-access-dialog
        :visible="showRequestedDialog"
        :group="group"
        @close="handleCloseRequestedAccessDialog"
      />
      <div class="header-row">
        <div class="header-names">
          <h1>{{ group.name }}</h1>
          <h2 v-if="group.name !== group.shortName" class="ml-3 text-gray-600">({{ group.shortName }})</h2>
        </div>

        <div class="header-buttons">
          <el-button v-if="currentUser != null && roleInGroup == null" type="primary" @click="handleRequestAccess">
            Request access
          </el-button>
          <el-button v-if="roleInGroup === 'PENDING'" disabled> Request sent </el-button>
        </div>
        <el-alert v-if="roleInGroup === 'INVITED'" type="info" show-icon :closable="false" title="">
          <div style="padding: 0 0 20px 20px">
            <p>You have been invited to join {{ group.name }}.</p>
            <div>
              <el-button type="danger" @click="handleRejectInvite"> Decline invitation </el-button>
              <el-button type="primary" @click="handleAcceptInvite"> Join group </el-button>
            </div>
          </div>
        </el-alert>
      </div>
      <el-tabs :model-value="tab as any" class="with-badges" @update:model-value="setTab">
        <el-tab-pane
          v-if="canEdit || group.groupDescriptionAsHtml !== ''"
          name="description"
          :label="'Description'"
          lazy
        >
          <group-description
            :group="group"
            :can-edit="canEdit && groupId != null"
            @updateGroupDescription="saveMarkdown"
          />
        </el-tab-pane>
        <el-tab-pane name="datasets" :label="optionalSuffixInParens('Datasets', countDatasets)" lazy>
          <dataset-list
            :datasets="groupDatasets.slice(0, maxVisibleDatasets)"
            hide-group-menu
            @filterUpdate="handleFilterUpdate"
          />
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
          <group-members-list
            :loading="groupLoading"
            :current-user="currentUser as any"
            :group="group"
            :members="members"
            :refresh-data="refetchGroup"
          />
          <p v-if="countHiddenMembers > 0" class="hidden-members-text">
            + {{ plural(countHiddenMembers, 'hidden member', 'hidden members') }}.
          </p>
        </el-tab-pane>
        <el-tab-pane v-if="showDatabasesTab" name="databases" lazy>
          <template v-slot:label>
            <span>
              <popup-anchor feature-key="groupDatabasesTab" :show-until="new Date('2021-03-01')" placement="bottom">
                {{ optionalSuffixInParens('Databases', countDatabases) }}
              </popup-anchor>
            </span>
          </template>

          <div>
            <molecular-databases :group-id="groupId" :can-delete="canEdit" />
          </div>
        </el-tab-pane>
        <el-tab-pane v-if="canEdit && groupId != null" name="subscription" label="Subscription" lazy>
          <group-usage :group-id="groupId" />
        </el-tab-pane>
        <el-tab-pane v-if="canEdit && groupId != null" name="settings" label="Settings" lazy>
          <group-settings :group-id="groupId" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, ref, watch, computed, inject, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { datasetDeletedQuery, DatasetDetailItem, datasetDetailItemFragment } from '../../api/dataset'
import DatasetList from '../Datasets/list/DatasetList.vue'
import {
  acceptGroupInvitationMutation,
  importDatasetsIntoGroupMutation,
  leaveGroupMutation,
  requestAccessToGroupMutation,
  updateGroupMutation,
  UserGroupRoleOptions,
  ViewGroupFragment,
  ViewGroupResult,
} from '../../api/group'
import gql from 'graphql-tag'
import TransferDatasetsDialog from './TransferDatasetsDialog.vue'
import GroupMembersList from './GroupMembersList.vue'
import GroupSettings from './GroupSettings.vue'
import GroupUsage from './GroupUsage'
import { encodeParams } from '../Filters'
import { useConfirmAsync } from '../../components/ConfirmAsync'
import NotificationIcon from '../../components/NotificationIcon.vue'
import reportError from '../../lib/reportError'
import { currentUserRoleQuery } from '../../api/user'
import isUuid from '../../lib/isUuid'
import { optionalSuffixInParens, plural } from '../../lib/vueFilters'
import GroupDescription from './GroupDescription.vue'
import MolecularDatabases from '../MolecularDatabases'
import config from '../../lib/config'
import PopupAnchor from '../NewFeaturePopup/PopupAnchor.vue'
import { RequestedAccessDialog } from './RequestedAccessDialog'
import { ElTabs, ElButton, ElTabPane, ElLoading, ElAlert } from '../../lib/element-plus'
import { useStore } from 'vuex'

interface ViewGroupProfileData {
  allDatasets: DatasetDetailItem[]
  countDatasets: number
}

export default defineComponent({
  components: {
    DatasetList,
    GroupMembersList,
    GroupSettings,
    TransferDatasetsDialog,
    NotificationIcon,
    GroupDescription,
    MolecularDatabases,
    PopupAnchor,
    RequestedAccessDialog,
    GroupUsage,
    ElTabs,
    ElButton,
    ElAlert,
    ElTabPane,
  },
  directives: {
    loading: ElLoading.directive,
  },
  setup() {
    const store = useStore()
    const route = useRoute()
    const router = useRouter()
    const confirmAsync = useConfirmAsync()
    const apolloClient = inject(DefaultApolloClient)
    const loaded = ref(false)
    const showTransferDatasetsDialog = ref(false)
    const showRequestedDialog = ref(false)
    const maxVisibleDatasets = ref(8)

    const { result: currentUserResult } = useQuery(currentUserRoleQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const currentUser: any = computed(() =>
      currentUserResult.value != null ? currentUserResult.value.currentUser : null
    )
    const groupIdOrSlug = computed(() => route.params?.groupIdOrSlug as string | null)

    const groupQuery = computed(() => {
      if (isUuid(groupIdOrSlug.value as string)) {
        return gql`
          query GroupProfileById($groupIdOrSlug: ID!) {
            group(groupId: $groupIdOrSlug) {
              ...ViewGroupFragment
              hasPendingRequest
            }
          }
          ${ViewGroupFragment}
        `
      } else {
        return gql`
          query GroupProfileBySlug($groupIdOrSlug: String!) {
            group: groupByUrlSlug(urlSlug: $groupIdOrSlug) {
              ...ViewGroupFragment
              hasPendingRequest
            }
          }
          ${ViewGroupFragment}
        `
      }
    })

    const {
      result: groupResult,
      refetch: refetchGroup,
      loading: groupLoading,
    } = useQuery(groupQuery.value, () => ({ groupIdOrSlug: groupIdOrSlug.value }), {
      // Can't be 'no-cache' because `refetchGroup` is used for updating the cache, which in turn updates
      // MetaspaceHeader's primaryGroup & the group.hasPendingRequest notification
      fetchPolicy: 'network-only',
    })
    const group = computed(() => groupResult.value?.group as ViewGroupResult | null)

    const groupId = computed((): string | null => {
      if (isUuid(groupIdOrSlug.value as string)) {
        return groupIdOrSlug.value as string // If it's possible to get the ID from the route, use that because it's faster than groupById/groupBySlug.
      } else {
        return group.value?.id
      }
    })

    const {
      result: dataResult,
      onResult: onDataResult,
      refetch: refetchData,
      subscribeToMore,
    } = useQuery(
      gql`
        query GroupProfileDatasets(
          $groupId: ID!
          $maxVisibleDatasets: Int!
          $inpFdrLvls: [Int!] = [10]
          $checkLvl: Int = 10
        ) {
          allDatasets(offset: 0, limit: $maxVisibleDatasets, filter: { group: $groupId }) {
            ...DatasetDetailItem
          }
          countDatasets(filter: { group: $groupId })
        }

        ${datasetDetailItemFragment}
      `,
      () => ({
        maxVisibleDatasets: maxVisibleDatasets.value,
        groupId: groupId.value,
      }),
      () => {
        return {
          enabled: groupId.value != null,
        }
      }
    )
    onDataResult(() => {
      // Not using 'loadingKey' pattern here to avoid getting a full-page loading spinner when the user clicks a
      // button that causes this query to refetch.
      setTimeout(() => {
        loaded.value = true
      }, 300)
    })
    const data = computed(() => dataResult.value as ViewGroupProfileData | null)
    const currentUserId = computed(() => currentUser.value?.id)
    const roleInGroup = computed(() => group.value?.currentUserRole)
    const groupDatasets = computed((): DatasetDetailItem[] =>
      (data.value?.allDatasets || []).filter((ds) => ds.status !== 'FAILED')
    )
    const countDatasets = computed((): number => data.value?.countDatasets || 0)
    const members = computed(() => group.value?.members || [])
    const countMembers = computed(() => group.value?.numMembers || 0)
    const countDatabases = computed(() => group.value?.numDatabases || 0)
    const isGroupMember = computed(() => roleInGroup.value === 'MEMBER' || roleInGroup.value === 'GROUP_ADMIN')
    const tab = computed(() => {
      if (
        ['description', 'datasets', 'members', 'databases', 'settings', 'subscription'].includes(
          route.query.tab as string
        )
      ) {
        return route.query.tab
      } else {
        return 'datasets'
      }
    })
    const isInvited = computed((): boolean => roleInGroup.value === 'INVITED')
    const datasetsListLink = computed(() => ({
      path: '/datasets',
      query: groupId.value && encodeParams({ group: groupId.value }),
    }))
    const canEdit = computed(() => {
      return roleInGroup.value === UserGroupRoleOptions.GROUP_ADMIN || currentUser.value?.role === 'admin'
    })
    const countHiddenMembers = computed(() => {
      if (countMembers.value != null) {
        return Math.max(0, countMembers.value - members.value.length)
      } else {
        return 0
      }
    })
    const hasMembershipRequest = computed(() => members.value?.some((m) => m.role === UserGroupRoleOptions.PENDING))
    const showDatabasesTab = computed(() => config.features.moldb_mgmt && (isGroupMember.value || canEdit.value))

    const setTab = (newTab: string | null) => {
      router.replace({ query: { tab: newTab } })
    }

    const canonicalizeUrl = () => {
      if (group.value !== null && group.value?.urlSlug !== null && groupIdOrSlug.value !== group.value?.urlSlug) {
        router.replace({
          params: { groupIdOrSlug: group.value?.urlSlug },
          query: route.query,
        })
      }
    }

    const groupSlug = computed(() => route.params?.groupIdOrSlug || group.value?.urlSlug)
    watch(
      () => groupSlug,
      () => {
        canonicalizeUrl()
      }
    )

    onMounted(() => {
      subscribeToMore({
        document: datasetDeletedQuery,
        updateQuery: () => {
          refetch()
        },
      })
    })

    const handleRequestAccess = async () => {
      showTransferDatasetsDialog.value = true
    }

    const handleAcceptInvite = async () => {
      showTransferDatasetsDialog.value = true
    }

    const refetch = async () => {
      return Promise.all([refetchGroup(), refetchData()])
    }

    const handleRejectInvite = async () => {
      const confirmOptions = {
        title: 'Decline invitation',
        message: 'Are you sure?',
        confirmButtonText: 'Decline invitation',
      }

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: leaveGroupMutation,
          variables: { groupId: groupId.value },
        })
        await refetch()
      })
    }

    const handleAcceptTransferDatasets = async (selectedDatasetIds: string[]) => {
      try {
        if (isInvited.value) {
          await apolloClient.mutate({
            mutation: acceptGroupInvitationMutation,
            variables: { groupId: groupId.value },
          })
        } else {
          await apolloClient.mutate({
            mutation: requestAccessToGroupMutation,
            variables: { groupId: groupId.value },
          })
        }
        if (selectedDatasetIds.length > 0) {
          await apolloClient.mutate({
            mutation: importDatasetsIntoGroupMutation,
            variables: { groupId: groupId.value, datasetIds: selectedDatasetIds },
          })
        }
        await refetch()
      } catch (err) {
        reportError(err)
      } finally {
        showTransferDatasetsDialog.value = false
        showRequestedDialog.value = true
      }
    }

    const handleCloseTransferDatasetsDialog = () => {
      showTransferDatasetsDialog.value = false
    }
    const handleCloseRequestedAccessDialog = () => {
      showRequestedDialog.value = false
    }

    const handleFilterUpdate = (newFilter: any) => {
      store.commit('updateFilter', {
        ...newFilter,
        group: groupId.value,
      })

      router.push({
        path: '/datasets',
        query: route.query,
      })
    }

    const saveMarkdown = async (newGroupDescription: string) => {
      await apolloClient.mutate({
        mutation: updateGroupMutation,
        variables: {
          groupId: groupId.value,
          groupDetails: {
            groupDescriptionAsHtml: newGroupDescription,
          },
        },
      })
      refetchGroup()
    }

    // Return everything that will be used in your template
    return {
      loaded,
      showTransferDatasetsDialog,
      showRequestedDialog,
      currentUser,
      group,
      data,
      handleRequestAccess,
      handleAcceptInvite,
      handleRejectInvite,
      handleFilterUpdate,
      handleAcceptTransferDatasets,
      handleCloseTransferDatasetsDialog,
      handleCloseRequestedAccessDialog,
      refetchGroup,
      saveMarkdown,
      optionalSuffixInParens,
      plural,
      maxVisibleDatasets,
      groupLoading,
      currentUserId,
      roleInGroup,
      groupDatasets,
      countDatasets,
      members,
      countMembers,
      countDatabases,
      isGroupMember,
      groupId,
      groupSlug,
      tab,
      setTab,
      isInvited,
      datasetsListLink,
      canEdit,
      countHiddenMembers,
      hasMembershipRequest,
      showDatabasesTab,
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
  @apply text-gray-600;
  text-align: center;
}
</style>
