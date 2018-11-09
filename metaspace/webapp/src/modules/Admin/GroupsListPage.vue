<template>
  <div class="page" v-if="currentUser && currentUser.role === 'admin'">
    <div class="page-content">
      <search-box v-model="query" />
      <el-row v-if="currentUser" type="flex" justify="end">
        <el-button @click="handleCreateGroup">Create group</el-button>
      </el-row>
      <div class="clearfix"/>
      <div v-loading="loading !== 0">
        <groups-list-item v-for="group in allGroups"
                            :key="group.id"
                            :group="group" />
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component } from 'vue-property-decorator';
  import { currentUserRoleQuery } from '../../api/user';
  import { SearchBox } from '../Filters';
  import GroupsListItem from './GroupsListItem.vue';
  import gql from 'graphql-tag';

  @Component({
    components: {
      SearchBox,
      GroupsListItem,
    },
    apollo: {
      currentUser: {
        query: currentUserRoleQuery,
        fetchPolicy: 'cache-first',
        loadingKey: 'loading',
      },
      allGroups: {
        query: gql`query ($query: String!) {
          allGroups(query: $query, limit: 1000) {
            id
            name
            shortName
            numMembers
            members {
              role
              user {
                name
              }
            }
          }
        }`,
        loadingKey: 'loading',
        variables() {
          return {
            query: this.query,
          }
        },
      },
    }
  })
  export default class GroupsListPage extends Vue {
    loading = 0;
    currentUser: any = null;
    allGroups: any[] | null = null;

    query = '';

    handleCreateGroup() {
      this.$router.push('/group/create');
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
    width: 800px;
  }
</style>
