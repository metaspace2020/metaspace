<template>
  <div v-loading="!loaded" class="page">
    <div v-if="group != null" class="page-content">
      <transfer-datasets-dialog
        v-if="showTransferDatasetsDialog"
        :groupName="group.name"
        :isInvited="isInvited"
        @accept="handleAcceptTransferDatasets"
        @close="handleCloseTransferDatasetsDialog"
      />
      <div class="header-row">
        <div class="header-names">
          <h1>{{group.name}}</h1>
          <h2 v-if="group.name !== group.shortName" class="short-name">({{group.shortName}})</h2>
        </div>

        <div class="header-buttons">
          <el-button v-if="currentUser != null && roleInGroup == null"
                     type="primary"
                     @click="handleRequestAccess">
            Request access
          </el-button>
          <el-button v-if="roleInGroup === 'PENDING'"
                     disabled>
            Request sent
          </el-button>
        </div>
        <el-alert v-if="roleInGroup === 'INVITED'"
                  type="info"
                  show-icon
                  :closable="false"
                  title="">
          <div style="padding: 0 0 20px 20px;">
            <p>
              You have been invited to join {{group.name}}.
            </p>
            <div>
              <el-button type="danger" @click="handleRejectInvite">
                Decline invitation
              </el-button>
              <el-button type="primary" @click="handleAcceptInvite">
                Join group
              </el-button>
            </div>
          </div>
        </el-alert>
      </div>
      <el-tabs v-model="tab">
        <el-tab-pane name="datasets" :label="'Datasets' | optionalSuffixInParens(countDatasets)" lazy>
          <dataset-list :datasets="groupDatasets.slice(0, maxVisibleDatasets)" @filterUpdate="handleFilterUpdate" hideGroupMenu />

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
            <group-members-list
              :loading="groupLoading !== 0"
              :currentUser="currentUser"
              :group="group"
              :members="members"
              :refreshData="refetchGroup"
            />
            <p v-if="countHiddenMembers > 0" class="hidden-members-text">
              + {{countHiddenMembers | plural('hidden member', 'hidden members')}}.
            </p>
          </div>
        </el-tab-pane>
        <el-tab-pane name="settings" label="Settings" v-if="canEdit && groupId != null" lazy>
          <group-settings :groupId="groupId" />
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
    acceptGroupInvitationMutation,
    importDatasetsIntoGroupMutation,
    leaveGroupMutation,
    requestAccessToGroupMutation,
    UserGroupRole, 
    UserGroupRoleOptions,
    ViewGroupFragment,
    ViewGroupResult,
  } from '../../api/group';
  import gql from 'graphql-tag';
  import TransferDatasetsDialog from './TransferDatasetsDialog.vue';
  import GroupMembersList from './GroupMembersList.vue';
  import GroupSettings from './GroupSettings.vue';
  import {encodeParams} from '../Filters';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import NotificationIcon from '../../components/NotificationIcon.vue';
  import reportError from '../../lib/reportError';
  import {currentUserRoleQuery, CurrentUserRoleResult} from '../../api/user';
  import isUuid from '../../lib/isUuid';
  import {throttle} from 'lodash-es';
  import {optionalSuffixInParens, plural} from '../../lib/vueFilters';
  import {removeDatasetFromAllDatasetsQuery} from '../../lib/updateApolloCache';


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
            ${ViewGroupFragment}`;
          } else {
            return gql`query GroupProfileBySlug($groupIdOrSlug: String!) {
              group: groupByUrlSlug(urlSlug: $groupIdOrSlug) { ...ViewGroupFragment hasPendingRequest }
            }
            ${ViewGroupFragment}`;
          }
        },
        variables() {
          return {groupIdOrSlug: this.$route.params.groupIdOrSlug};
        },
        // Can't be 'no-cache' because `refetchGroup` is used for updating the cache, which in turn updates
        // MetaspaceHeader's primaryGroup & the group.hasPendingRequest notification
        fetchPolicy: 'network-only',
        loadingKey: 'groupLoading'
      },
      data: {
        query: gql`query GroupProfileDatasets($groupId: ID!, $maxVisibleDatasets: Int!, $inpFdrLvls: [Int!] = [10], $checkLvl: Int = 10) {
          allDatasets(offset: 0, limit: $maxVisibleDatasets, filter: { group: $groupId }) {
            ...DatasetDetailItem
          }
          countDatasets(filter: { group: $groupId })
        }

        ${datasetDetailItemFragment}`,
        variables() {
          return {
            maxVisibleDatasets: this.maxVisibleDatasets,
            groupId: this.groupId
          }
        },
        update(data) {
          // Not using 'loadingKey' pattern here to avoid getting a full-page loading spinner when the user clicks a
          // button that causes this query to refetch.
          this.loaded = true;
          return data;
        },
        skip() {
          return this.groupId == null
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
  export default class ViewGroupPage extends Vue {
    groupLoading = 0;
    loaded = false;
    showTransferDatasetsDialog: boolean = false;
    currentUser: CurrentUserRoleResult | null = null;
    group: ViewGroupResult | null = null;
    data: ViewGroupProfileData | null = null;

    get currentUserId(): string | null { return this.currentUser && this.currentUser.id }
    get roleInGroup(): UserGroupRole | null { return this.group && this.group.currentUserRole; }
    get groupDatasets(): DatasetDetailItem[] { return this.data && this.data.allDatasets || []; }
    get countDatasets(): number { return this.data && this.data.countDatasets || 0; }
    get members() { return this.group && this.group.members || []; }
    get countMembers() { return this.group && this.group.numMembers; }
    maxVisibleDatasets = 8;

    get groupId(): string | null {
      if (isUuid(this.$route.params.groupIdOrSlug)) {
        return this.$route.params.groupIdOrSlug; // If it's possible to get the ID from the route, use that because it's faster than groupById/groupBySlug.
      } else {
        return this.group && this.group.id
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
      return this.roleInGroup === 'INVITED';
    }

    get datasetsListLink() {
      return {
        path: '/datasets',
        query: this.groupId && encodeParams({
          group: this.groupId,
        })
      }
    }

    get canEdit() {
      return this.roleInGroup === UserGroupRoleOptions.GROUP_ADMIN
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
      return this.members.some(m => m.role === UserGroupRoleOptions.PENDING);
    }

    @Watch('$route.params.groupIdOrSlug')
    @Watch('group.urlSlug')
    canonicalizeUrl() {
      if (isUuid(this.$route.params.groupIdOrSlug) && this.group != null && this.group.urlSlug) {
        this.$router.replace({
          params: {groupIdOrSlug: this.group.urlSlug},
          query: this.$route.query,
        });
      }
    }

    async handleRequestAccess() {
      this.showTransferDatasetsDialog = true;
    }

    async handleAcceptInvite() {
      this.showTransferDatasetsDialog = true;
    }

    @ConfirmAsync({
      title: 'Decline invitation',
      message: 'Are you sure?',
      confirmButtonText: "Decline invitation"
    })
    async handleRejectInvite() {
      await this.$apollo.mutate({
        mutation: leaveGroupMutation,
        variables: { groupId: this.groupId },
      });
      await this.refetch();
    }

    async handleAcceptTransferDatasets(selectedDatasetIds: string[]) {
      try {
        if (this.isInvited) {
          await this.$apollo.mutate({
            mutation: acceptGroupInvitationMutation,
            variables: { groupId: this.groupId },
          });
        } else {
          await this.$apollo.mutate({
            mutation: requestAccessToGroupMutation,
            variables: { groupId: this.groupId },
          });
        }
        if (selectedDatasetIds.length > 0) {
          await this.$apollo.mutate({
            mutation: importDatasetsIntoGroupMutation,
            variables: { groupId: this.groupId, datasetIds: selectedDatasetIds },
          });
        }
        await this.refetch();
      } catch (err) {
        reportError(err);
      } finally {
        this.showTransferDatasetsDialog = false;
      }
    }

    handleCloseTransferDatasetsDialog() {
      this.showTransferDatasetsDialog = false;
    }

    handleFilterUpdate(newFilter: any) {
      this.$store.commit('updateFilter', {
        ...newFilter,
        group: this.groupId
      });

      this.$router.push({
        path: '/datasets',
        query: this.$route.query,
      })
    }

    async refetchGroup() {
      return await this.$apollo.queries.group.refetch();
    }

    async refetch() {
      return await Promise.all([
        this.$apollo.queries.group.refetch(),
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
  .short-name {
    margin-left: 16px;
    color: grey;
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
