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
          <h2 class="short-name">({{group.shortName}})</h2>
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
          <el-button v-if="roleInGroup === 'GROUP_ADMIN'"
                     type="primary"
                     @click="handleManageGroup">
            Manage group
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
      <div v-if="groupDatasets.length > 0">
        <h2>Datasets</h2>

        <dataset-list :datasets="groupDatasets.slice(0, maxVisibleDatasets)" />

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
  import {
    acceptGroupInvitationMutation,
    importDatasetsIntoGroupMutation,
    leaveGroupMutation,
    requestAccessToGroupMutation,
    UserGroupRole,
  } from '../../api/group';
  import gql from 'graphql-tag';
  import TransferDatasetsDialog from './TransferDatasetsDialog.vue';
  import { encodeParams } from '../Filters';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import reportError from '../../lib/reportError';
  import { currentUserIdQuery, CurrentUserIdResult } from '../../api/user';
  import isUuid from '../../lib/isUuid';


  interface GroupInfo {
    id: string;
    name: string;
    shortName: string;
    urlSlug: string | null;
    currentUserRole: UserGroupRole | null;
  }
  const groupInfoFragment = gql`fragment GroupInfoFragment on Group {
    id
    name
    shortName
    urlSlug
    currentUserRole
  }`;

  interface ViewGroupProfileData {
    allDatasets: DatasetDetailItem[];
    countDatasets: number;
  }

  @Component<ViewGroupProfile>({
    components: {
      DatasetList,
      TransferDatasetsDialog,
    },
    apollo: {
      currentUser: {
        query: currentUserIdQuery,
        fetchPolicy: 'cache-first',
      },
      group: {
        query() {
          if (isUuid(this.$route.params.groupIdOrSlug)) {
            return gql`query GroupProfileById($groupIdOrSlug: ID!) {
              group(groupId: $groupIdOrSlug) { ...GroupInfoFragment }
            }
            ${groupInfoFragment}`;
          } else {
            return gql`query GroupProfileBySlug($groupIdOrSlug: String!) {
              group: groupByUrlSlug(urlSlug: $groupIdOrSlug) { ...GroupInfoFragment }
            }
            ${groupInfoFragment}`;
          }
        },
        variables() {
          return {groupIdOrSlug: this.$route.params.groupIdOrSlug};
        }
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
        datasetStatusUpdated: {
          query: datasetStatusUpdatedQuery,
          result({data}: any) {
            // TODO: Fix websocket authentication so that this can filter out irrelevant status updates
            // const dataset = data.datasetStatusUpdated.dataset;
            // if (dataset != null && dataset.group != null && dataset.group.id === this.groupId) {
            //   this.$apollo.queries.data.refetch();
            // }
            this.$apollo.queries.data.refetch();
          }
        }
      },
    }
  })
  export default class ViewGroupProfile extends Vue {
    loaded = false;
    showTransferDatasetsDialog: boolean = false;
    currentUser: CurrentUserIdResult | null = null;
    group: GroupInfo | null = null;
    data: ViewGroupProfileData | null = null;

    get currentUserId(): string | null { return this.currentUser && this.currentUser.id }
    get roleInGroup(): UserGroupRole | null { return this.group && this.group.currentUserRole; }
    get groupDatasets(): DatasetDetailItem[] { return this.data && this.data.allDatasets || []; }
    get countDatasets(): number { return this.data && this.data.countDatasets || 0; }
    maxVisibleDatasets = 8;

    get groupId(): string | null {
      if (isUuid(this.$route.params.groupIdOrSlug)) {
        return this.$route.params.groupIdOrSlug; // If it's possible to get the ID from the route, use that because it's faster than groupById/groupBySlug.
      } else {
        return this.group && this.group.id
      }
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

    @Watch('$route.params.groupIdOrSlug')
    @Watch('group.urlSlug')
    canonicalizeUrl() {
      if (isUuid(this.$route.params.groupIdOrSlug) && this.group != null && this.group.urlSlug) {
        this.$router.replace({
          params: {groupIdOrSlug: this.group.urlSlug}
        })
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

    handleManageGroup() {
      if (this.groupId != null) {
        this.$router.push({
          name: 'edit-group',
          params: { groupId: this.groupId }
        });
      }
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

    async refetch() {
      return await Promise.all([
        this.$apollo.queries.group.refetch(),
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
</style>
