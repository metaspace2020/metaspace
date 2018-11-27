<template>
  <div class="group-item">
    <router-link :to="groupLink" class="underlay" />
    <div class="item-body">
      <div class="info">
        <div class="info-line group-name">
          <router-link :to="groupLink">
            {{group.name}}
            <i v-if="group.shortName !== group.name">({{group.shortName}})</i>
          </router-link>
        </div>
        <div class="info-line">
          <span v-if="countDatasets != null && countDatasets > 0">
            <router-link :to="datasetsLink">{{countDatasets | plural('Dataset', 'Datasets')}}</router-link>,
          </span>
          {{group.numMembers | plural('Member', 'Members')}}
        </div>
      </div>
      <div class="actions">
        <div>
          <i class="el-icon-picture" />
          <router-link :to="datasetsLink">Browse datasets</router-link>
        </div>
        <div>
          <i class="el-icon-edit"></i>
          <router-link :to="manageLink">Manage group</router-link>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import { encodeParams } from '../Filters';
  import gql from 'graphql-tag';
  import {plural} from '../../lib/vueFilters';

  @Component({
    apollo: {
      countDatasets: {
        query: gql`query ($groupId: ID!) { countDatasets(filter: { group: $groupId }) }`,
        variables() {
          return {groupId: this.group.id}
        }
      }
    },
    filters: {
      plural,
    }
  })
  export default class GroupsListItem extends Vue {
    @Prop({type: Object, required: true})
    group: any;

    get groupLink() {
      return {
        name: 'group',
        params: {groupIdOrSlug: this.group.urlSlug || this.group.id}
      }
    }

    get datasetsLink() {
      return {
        path: '/datasets',
        query: encodeParams({group: this.group.id })
      }
    }

    get manageLink() {
      return {
        name: 'group',
        params: {groupIdOrSlug: this.group.urlSlug || this.group.id},
        query: {tab: 'settings'},
      }
    }
  }

</script>
<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/common/var";

  .group-item {
    position: relative;
    border-radius: 5px;
    width: 100%;
    max-width: 800px;
    margin: 8px 0;
    padding: 10px;
    border: 1px solid #cce4ff;
    box-sizing: border-box;
    > * {
      z-index: 1;
    }
    > .underlay {
      z-index: 0;
    }
  }

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

  .group-name a {
    font-size: 1.5em;
    text-decoration: none;
    color: $--color-text-regular;

    i {
      font-size: 0.75em;
      color: grey;
    }
  }

  .underlay {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
  }

  .actions {
    width: 170px;
  }


</style>
