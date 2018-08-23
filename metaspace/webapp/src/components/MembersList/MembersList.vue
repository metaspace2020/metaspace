<template>
  <div>
    <h2>Members</h2>
    <el-table :data="currentPageData"
              :row-key="row => row.user.id"
              v-loading="loading"
              element-loading-text="Loading results from the server...">

      <p slot="empty">You do not have access to view the member list.</p>

      <el-table-column label="Name" min-width="200">
        <template slot-scope="scope">
          {{scope.row.user.name}}
        </template>
      </el-table-column>

      <el-table-column label="Email" min-width="200">
        <template slot-scope="scope">
          {{scope.row.user.email}}
        </template>
      </el-table-column>

      <el-table-column label="Role" width="160">
        <template slot-scope="scope">
          {{getRoleName(scope.row.role)}}
        </template>
      </el-table-column>

      <el-table-column label="Datasets" width="90" align="center">
        <template slot-scope="scope">
          <router-link :to="datasetsListLink(scope.row.user)">{{scope.row.numDatasets}}</router-link>
        </template>
      </el-table-column>

      <el-table-column width="200">
        <template slot-scope="scope">
          <el-button
            v-if="canEdit && scope.row.role === 'MEMBER'"
            size="mini"
            class="grid-button"
            @click="() => handleRemoveUser(scope.row)">
            Remove
          </el-button>
          <el-button
            v-if="canEdit && scope.row.role === 'INVITED'"
            size="mini"
            class="grid-button"
            @click="() => handleCancelInvite(scope.row)">
            Cancel
          </el-button>
          <el-button
            v-if="canEdit && scope.row.role === 'PENDING'"
            size="mini"
            type="success"
            class="grid-button"
            @click="() => handleAcceptUser(scope.row)">
            Accept
          </el-button>
          <el-button
            v-if="canEdit && scope.row.role === 'PENDING'"
            size="mini"
            class="grid-button"
            @click="() => handleRejectUser(scope.row)">
            Decline
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-row">
      <el-pagination v-if="members.length > pageSize || page !== 1"
                     :total="members.length"
                     :page-size="pageSize"
                     :current-page.sync="page"
                     layout="prev,pager,next" />
      <div class="flex-spacer" />
      <el-button v-if="canEdit" @click="handleAddMember">Add member</el-button>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component, Emit, Prop } from 'vue-property-decorator';
  import { getRoleName as getGroupRoleName, UserGroupRole } from '../../api/group';
  import { getRoleName as getProjectRoleName, ProjectRole } from '../../api/project';
  import { encodeParams } from '../../url';

  export interface Member {
    role: UserGroupRole | ProjectRole,
    numDatasets: number,
    user: {
      id: string;
      name: string;
      email: string | null;
    }
  }

  @Component({})
  export default class MembersList extends Vue {
    @Prop({type:Boolean, required: true})
    loading!: boolean;
    @Prop({type:Array, required: true})
    members!: Member[];
    @Prop({type:Boolean, required: true})
    canEdit!: boolean;
    @Prop({type: String, required: true})
    type!: 'group' | 'project';
    @Prop({required: true})
    filter!: any;

    pageSize: number = 10;
    page: number = 1;

    get getRoleName() {
      return this.type === 'group' ? getGroupRoleName : getProjectRoleName;
    }

    get currentPageData(): Member[] {
      return this.members.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
    }

    datasetsListLink(user: Member['user']) {
      const filters = {
        ...this.filter,
        submitter: {id: user.id, name: user.name},
      };
      const path = '/datasets';
      const query = encodeParams(filters, path, this.$store.state.filterLists);
      return { path, query }
    }

    @Emit('removeUser')
    handleRemoveUser(user: Member) {}

    @Emit('cancelInvite')
    handleCancelInvite(user: Member) {}

    @Emit('acceptUser')
    handleAcceptUser(user: Member) {}

    @Emit('rejectUser')
    handleRejectUser(user: Member) {}

    @Emit('addMember')
    handleAddMember() {}
  }

</script>
<style scoped lang="scss">
  .page {
    display: flex;
    justify-content: center;
  }

  .page-content {
    width: 950px;
  }

  .header-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  }

  .header-row-buttons {
    display: flex;
    margin-right: 3px;
  }

  .name {
    display: inline-block;
    width: 400px;
  }

  .shortName {
    display: inline-block;
    width: 150px;
    margin-left: 20px;
  }

  .grid-button {
    width: 80px;
  }

  .pagination-row {
    display: flex;
    align-items: center;
    margin-top: 10px;
  }

  .flex-spacer {
    flex-grow: 1;
  }

</style>
