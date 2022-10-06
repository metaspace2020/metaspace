<template>
  <div
    v-loading="!loaded"
    class="page"
  >
    <div
      v-if="group != null"
      class="page-content"
    >
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
          <h2
            v-if="group.name !== group.shortName"
            class="ml-3 text-gray-600"
          >
            ({{ group.shortName }})
          </h2>
        </div>

        <div class="header-buttons">
          <el-button
            v-if="currentUser != null && roleInGroup == null"
            type="primary"
            @click="handleRequestAccess"
          >
            Request access
          </el-button>
          <el-button
            v-if="roleInGroup === 'PENDING'"
            disabled
          >
            Request sent
          </el-button>
        </div>
        <el-alert
          v-if="roleInGroup === 'INVITED'"
          type="info"
          show-icon
          :closable="false"
          title=""
        >
          <div style="padding: 0 0 20px 20px;">
            <p>
              You have been invited to join {{ group.name }}.
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
                @click="handleAcceptInvite"
              >
                Join group
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
        <el-tab-pane
          name="datasets"
          :label="'Datasets' | optionalSuffixInParens(countDatasets)"
          lazy
        >
          <dataset-list
            :datasets="groupDatasets.slice(0, maxVisibleDatasets)"
            hide-group-menu
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
          <group-members-list
            :loading="groupLoading !== 0"
            :current-user="currentUser"
            :group="group"
            :members="members"
            :refresh-data="refetchGroup"
          />
          <p
            v-if="countHiddenMembers > 0"
            class="hidden-members-text"
          >
            + {{ countHiddenMembers | plural('hidden member', 'hidden members') }}.
          </p>
        </el-tab-pane>
        <el-tab-pane
          v-if="showDatabasesTab"
          name="databases"
          lazy
        >
          <span slot="label">
            <popup-anchor
              feature-key="groupDatabasesTab"
              :show-until="new Date('2021-03-01')"
              placement="bottom"
            >
              {{ 'Databases' | optionalSuffixInParens(countDatabases) }}
            </popup-anchor>
          </span>
          <div>
            <molecular-databases
              :group-id="groupId"
              :can-delete="canEdit"
            />
          </div>
        </el-tab-pane>
        <el-tab-pane
          v-if="canEdit && groupId != null"
          name="settings"
          label="Settings"
          lazy
        >
          <group-settings :group-id="groupId" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Watch } from 'vue-property-decorator'
import { datasetDeletedQuery, DatasetDetailItem, datasetDetailItemFragment } from '../../api/dataset'
import DatasetList from '../Datasets/list/DatasetList.vue'
import {
  acceptGroupInvitationMutation,
  importDatasetsIntoGroupMutation,
  leaveGroupMutation,
  requestAccessToGroupMutation,
  updateGroupMutation,
  UpdateGroupMutation,
  UserGroupRole,
  UserGroupRoleOptions,
  ViewGroupFragment,
  ViewGroupResult,
} from '../../api/group'
import gql from 'graphql-tag'
import TransferDatasetsDialog from './TransferDatasetsDialog.vue'
import GroupMembersList from './GroupMembersList.vue'
import GroupSettings from './GroupSettings.vue'
import { encodeParams } from '../Filters'
import ConfirmAsync from '../../components/ConfirmAsync'
import NotificationIcon from '../../components/NotificationIcon.vue'
import reportError from '../../lib/reportError'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import isUuid from '../../lib/isUuid'
import { optionalSuffixInParens, plural } from '../../lib/vueFilters'
import { removeDatasetFromAllDatasetsQuery } from '../../lib/updateApolloCache'
import GroupDescription from './GroupDescription.vue'
import MolecularDatabases from '../MolecularDatabases'
import config from '../../lib/config'
import PopupAnchor from '../NewFeaturePopup/PopupAnchor.vue'
import { RequestedAccessDialog } from './RequestedAccessDialog'

interface ViewGroupProfileData {
    allDatasets: DatasetDetailItem[];
    countDatasets: number;
  }

  @Component<ViewGroupPage>({
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
      group: {
        query() {
          if (isUuid(this.$route.params.groupIdOrSlug)) {
            return gql`query GroupProfileById($groupIdOrSlug: ID!) {
              group(groupId: $groupIdOrSlug) { ...ViewGroupFragment hasPendingRequest }
            }
            ${ViewGroupFragment}`
          } else {
            return gql`query GroupProfileBySlug($groupIdOrSlug: String!) {
              group: groupByUrlSlug(urlSlug: $groupIdOrSlug) { ...ViewGroupFragment hasPendingRequest }
            }
            ${ViewGroupFragment}`
          }
        },
        variables() {
          return { groupIdOrSlug: this.$route.params.groupIdOrSlug }
        },
        // Can't be 'no-cache' because `refetchGroup` is used for updating the cache, which in turn updates
        // MetaspaceHeader's primaryGroup & the group.hasPendingRequest notification
        fetchPolicy: 'network-only',
        loadingKey: 'groupLoading',
      },
      data: {
        query: gql`query GroupProfileDatasets(
          $groupId: ID!,
          $maxVisibleDatasets: Int!,
          $inpFdrLvls: [Int!] = [10],
          $checkLvl: Int = 10
        ) {
          allDatasets(offset: 0, limit: $maxVisibleDatasets, filter: { group: $groupId }) {
            ...DatasetDetailItem
          }
          countDatasets(filter: { group: $groupId })
        }

        ${datasetDetailItemFragment}`,
        variables() {
          return {
            maxVisibleDatasets: this.maxVisibleDatasets,
            groupId: this.groupId,
          }
        },
        update(data) {
          // Not using 'loadingKey' pattern here to avoid getting a full-page loading spinner when the user clicks a
          // button that causes this query to refetch.
          this.loaded = true
          return data
        },
        skip() {
          return this.groupId == null
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
export default class ViewGroupPage extends Vue {
    groupLoading = 0;
    loaded = false;
    showTransferDatasetsDialog: boolean = false;
    showRequestedDialog: boolean = false;
    showUploadDatabaseDialog: boolean = false;
    currentUser: CurrentUserRoleResult | null = null;
    group: ViewGroupResult | null = null;
    data: ViewGroupProfileData | null = null;

    get currentUserId(): string | null { return this.currentUser && this.currentUser.id }
    get roleInGroup(): UserGroupRole | null { return this.group && this.group.currentUserRole }

    get groupDatasets(): DatasetDetailItem[] {
      return (this.data && this.data.allDatasets || []).filter(ds => ds.status !== 'FAILED')
    }

    get countDatasets(): number { return this.data && this.data.countDatasets || 0 }
    get members() { return this.group && this.group.members || [] }
    get countMembers() { return this.group && this.group.numMembers }
    maxVisibleDatasets = 8;

    get countDatabases() { return this.group?.numDatabases || 0 }

    get isGroupMember() {
      return this.roleInGroup === 'MEMBER' || this.roleInGroup === 'GROUP_ADMIN'
    }

    // get canEditGroupDescr() {
    //   if (!this.canEdit() && this.group.groupDescriptionAsHtml === '') {
    //     return false
    //   } else {
    //     return true
    //   }
    // }

    get groupId(): string | null {
      if (isUuid(this.$route.params.groupIdOrSlug)) {
        return this.$route.params.groupIdOrSlug // If it's possible to get the ID from the route, use that because it's faster than groupById/groupBySlug.
      } else {
        return this.group && this.group.id
      }
    }

    get tab() {
      if (['description', 'datasets', 'members', 'databases', 'settings'].includes(this.$route.query.tab)) {
        return this.$route.query.tab
      } else {
        return 'datasets'
      }
    }

    set tab(tab: string) {
      this.$router.replace({ query: { tab } })
    }

    get isInvited(): boolean {
      return this.roleInGroup === 'INVITED'
    }

    get datasetsListLink() {
      return {
        path: '/datasets',
        query: this.groupId && encodeParams({
          group: this.groupId,
        }),
      }
    }

    get canEdit() {
      return this.roleInGroup === UserGroupRoleOptions.GROUP_ADMIN
        || (this.currentUser && this.currentUser.role === 'admin')
    }

    get countHiddenMembers() {
      if (this.countMembers != null) {
        return Math.max(0, this.countMembers - this.members.length)
      } else {
        return 0
      }
    }

    get hasMembershipRequest() {
      return this.members.some(m => m.role === UserGroupRoleOptions.PENDING)
    }

    get showDatabasesTab() {
      return config.features.moldb_mgmt && (this.isGroupMember || this.canEdit)
    }

    @Watch('$route.params.groupIdOrSlug')
    @Watch('group.urlSlug')
    canonicalizeUrl() {
      if (this.group != null
              && this.group.urlSlug != null
              && this.$route.params.groupIdOrSlug !== this.group.urlSlug) {
        this.$router.replace({
          params: { groupIdOrSlug: this.group.urlSlug },
          query: this.$route.query,
        })
      }
    }

    async handleRequestAccess() {
      this.showTransferDatasetsDialog = true
    }

    async handleAcceptInvite() {
      this.showTransferDatasetsDialog = true
    }

    @ConfirmAsync({
      title: 'Decline invitation',
      message: 'Are you sure?',
      confirmButtonText: 'Decline invitation',
    })
    async handleRejectInvite() {
      await this.$apollo.mutate({
        mutation: leaveGroupMutation,
        variables: { groupId: this.groupId },
      })
      await this.refetch()
    }

    async handleAcceptTransferDatasets(selectedDatasetIds: string[]) {
      try {
        if (this.isInvited) {
          await this.$apollo.mutate({
            mutation: acceptGroupInvitationMutation,
            variables: { groupId: this.groupId },
          })
        } else {
          await this.$apollo.mutate({
            mutation: requestAccessToGroupMutation,
            variables: { groupId: this.groupId },
          })
        }
        if (selectedDatasetIds.length > 0) {
          await this.$apollo.mutate({
            mutation: importDatasetsIntoGroupMutation,
            variables: { groupId: this.groupId, datasetIds: selectedDatasetIds },
          })
        }
        await this.refetch()
      } catch (err) {
        reportError(err)
      } finally {
        this.showTransferDatasetsDialog = false
        this.showRequestedDialog = true
      }
    }

    handleCloseTransferDatasetsDialog() {
      this.showTransferDatasetsDialog = false
    }

    handleCloseRequestedAccessDialog() {
      this.showRequestedDialog = false
    }

    handleFilterUpdate(newFilter: any) {
      this.$store.commit('updateFilter', {
        ...newFilter,
        group: this.groupId,
      })

      this.$router.push({
        path: '/datasets',
        query: this.$route.query,
      })
    }

    async saveMarkdown(newGroupDescription: string) {
      await this.$apollo.mutate<UpdateGroupMutation>({
        mutation: updateGroupMutation,
        variables: {
          groupId: this.groupId,
          groupDetails: {
            groupDescriptionAsHtml: newGroupDescription,
          },
        },
      })
      this.refetchGroup()
    }

    async refetchGroup() {
      return this.$apollo.queries.group.refetch()
    }

    async refetch() {
      return Promise.all([
        this.$apollo.queries.group.refetch(),
        this.$apollo.queries.data.refetch(),
      ])
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
