<template>
  <el-table
    :data="rows"
    style="width: 100%;padding-left: 15px;">
    <el-table-column
      :label="typeName"
      width="180">
      <template slot-scope="scope">
        <router-link :to="scope.row.route">{{scope.row.name}}</router-link>
      </template>
    </el-table-column>
    <el-table-column
      prop="roleName"
      label="Role"
      width="280"
    />
    <el-table-column label="Datasets contributed">
      <template slot-scope="scope">
        <router-link :to="scope.row.datasetsRoute">{{scope.row.numDatasets}}</router-link>
      </template>
    </el-table-column>
    <el-table-column>
      <template slot-scope="scope">
        <el-button
          v-if="scope.row.role === 'MEMBER'"
          size="mini"
          icon="el-icon-arrow-right"
          @click="handleLeave(scope.row)">
          Leave
        </el-button>
        <el-button
          v-if="scope.row.role === 'PRINCIPAL_INVESTIGATOR' || scope.row.role === 'MANAGER'"
          size="mini"
          icon="el-icon-arrow-right"
          disabled>
          Leave
        </el-button>
        <el-button
          v-if="scope.row.role === 'INVITED'"
          size="mini"
          type="success"
          @click="handleAcceptInvitation(scope.row)"
          icon="el-icon-check">
          Accept
        </el-button>
        <el-button
          v-if="scope.row.role === 'INVITED'"
          size="mini"
          icon="el-icon-close"
          @click="handleDeclineInvitation(scope.row)">
          Decline
        </el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script lang="ts">
  import Vue from 'vue'
  import { Component, Emit, Prop } from 'vue-property-decorator';
  import { UserProfileQuery, UserProfileQueryGroup, UserProfileQueryProject } from '../../api/user';
  import { getRoleName as getGroupRoleName } from '../../api/group';
  import { getRoleName as getProjectRoleName } from '../../api/project';
  import { MembershipTableRow } from './MembershipTableRow';
  import { encodeParams } from '../../url';

  @Component
  export default class MembershipTable extends Vue {
    @Prop({type: String, required: true})
    type!: 'group' | 'project';
    @Prop(Array)
    items?: (UserProfileQueryGroup | UserProfileQueryProject)[];
    @Prop()
    user?: UserProfileQuery;

    get typeName() {
      return this.type === 'group' ? 'Group' : 'Project';
    }

    get rows(): MembershipTableRow[] {
      if (this.items != null && this.user != null) {
        return this.items.map((item) => {
          const {numDatasets, role} = item;
          const {id, name} = this.type === 'group'
            ? (item as UserProfileQueryGroup).group
            : (item as UserProfileQueryProject).project;
          const path = '/datasets';
          const filters = {
            [this.type]: { id, name },
            submitter: { id: this.user!.id, name: this.user!.name }
          };
          const query = encodeParams(filters, path, this.$store.state.filterLists);
          return {
            id, name, role, numDatasets,
            roleName: this.type === 'group' ? getGroupRoleName(role) : getProjectRoleName(role),
            route: this.type === 'group' ? `/group/${id}` : `/project/${id}`,
            datasetsRoute: {path, query},
          };
        });
      }
      return [];
    }

    @Emit('leave')
    handleLeave(row: MembershipTableRow) {
    }

    @Emit('acceptInvitation')
    handleAcceptInvitation(row: MembershipTableRow) {
    }

    @Emit('declineInvitation')
    handleDeclineInvitation(row: MembershipTableRow) {
    }
  }
</script>
<style>
</style>
