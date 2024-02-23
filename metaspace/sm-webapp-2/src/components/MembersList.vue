<template>
  <div>
    <el-dialog
      :model-value="editingRoleOfMember != null"
      :title="`Change ${type} member role`"
      @close="handleCloseEditRole"
    >
      <p>
        Change {{ editingRoleOfMember?.user?.name }}'s role to:
        <el-select v-model="newRole">
          <el-option v-for="role in allowedRoles" :key="role" :value="role" :label="getRoleName(role as any)" />
          <el-option :value="''" :label="`None (remove from ${type})`" />
        </el-select>
      </p>
      <p>Changing a member's role this way does not cause any notification emails to be sent.</p>
      <el-row align="middle">
        <el-button @click="handleCloseEditRole"> Close </el-button>
        <el-button type="primary" @click="handleUpdateRole"> Save </el-button>
      </el-row>
    </el-dialog>
    <el-table
      v-loading="loading"
      :data="currentPageData"
      :row-key="(row) => row?.user.id"
      element-loading-text="Loading results from the server..."
    >
      <template v-slot:empty>
        <p>You do not have access to view the member list.</p>
      </template>

      <el-table-column label="Name" min-width="200">
        <template v-slot="{ row }">
          {{ row?.user?.name }}
        </template>
      </el-table-column>

      <el-table-column v-if="shouldShowEmails" label="Email" min-width="200">
        <template v-slot="{ row }">
          {{ row?.user?.email }}
        </template>
      </el-table-column>

      <el-table-column label="Role" width="160">
        <template v-slot="{ row }">
          <a v-if="canEditRoleFor(row)" href="#" title="Change role" @click.prevent="() => handleEditRole(row)">
            {{ getRoleName(row?.role) }}
          </a>
          <span v-else>
            {{ getRoleName(row?.role) }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="Datasets" width="90" align="center">
        <template v-slot="{ row }">
          <router-link :to="datasetsListLink(row?.user)">
            {{ row?.numDatasets }}
          </router-link>
        </template>
      </el-table-column>

      <el-table-column width="200">
        <template v-slot="{ row }">
          <el-button
            v-if="canEdit && row?.role === 'MEMBER'"
            size="small"
            class="grid-button"
            @click="() => handleRemoveUser(row)"
          >
            Remove
          </el-button>
          <el-button
            v-if="canEdit && row?.role === 'INVITED'"
            size="small"
            class="grid-button"
            @click="() => handleCancelInvite(row)"
          >
            Cancel
          </el-button>
          <el-button
            v-if="canEdit && row?.role === 'PENDING'"
            size="small"
            type="success"
            class="grid-button"
            @click="() => handleAcceptUser(row)"
          >
            Accept
          </el-button>
          <el-button
            v-if="canEdit && row?.role === 'PENDING'"
            size="small"
            class="grid-button"
            @click="() => handleRejectUser(row)"
          >
            Decline
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-row">
      <el-pagination
        v-if="members.length > pageSize || page !== 1"
        :total="members.length"
        :page-size="pageSize"
        :current-page="page"
        layout="prev,pager,next"
      />
      <div class="flex-spacer" />
      <el-button v-if="canEdit" @click="() => handleAddMember()"> Add member </el-button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue'
import { UserGroupRole, UserGroupRoleOptions, getRoleName as getGroupRoleName } from '../api/group'
import { ProjectRole, ProjectRoleOptions, getRoleName as getProjectRoleName } from '../api/project'
import { encodeParams } from '../modules/Filters'
import { CurrentUserRoleResult } from '../api/user'
import {
  ElDialog,
  ElButton,
  ElSelect,
  ElOption,
  ElRow,
  ElTableColumn,
  ElPagination,
  ElTable,
  ElLoading,
} from '../lib/element-plus'

export interface Member {
  role: UserGroupRole | ProjectRole
  numDatasets: number
  user: {
    id: string
    name: string
    email: string | null
  }
}

export default defineComponent({
  name: 'MembersList',
  components: {
    ElDialog,
    ElButton,
    ElSelect,
    ElOption,
    ElRow,
    ElTableColumn,
    ElPagination,
    ElTable,
  },
  directives: {
    loading: ElLoading.directive,
  },
  props: {
    loading: {
      type: Boolean,
      required: true,
    },
    currentUser: Object as () => CurrentUserRoleResult | null,
    members: {
      type: Array as () => Member[],
      required: true,
    },
    canEdit: {
      type: Boolean,
      required: true,
    },
    type: {
      type: String as () => 'group' | 'project',
      required: true,
    },
    filter: Object,
  },
  setup(props, { emit }) {
    const pageSize = ref(10)
    const page = ref(1)
    const editingRoleOfMember = ref<Member | null>(null)
    const newRole = ref<string | null>(null)

    const getRoleName = computed(() => {
      return props.type === 'group' ? getGroupRoleName : getProjectRoleName
    })

    const roles = computed(() => {
      return props.type === 'group' ? Object.values(UserGroupRoleOptions) : Object.values(ProjectRoleOptions)
    })

    const allowedRoles = computed(() => {
      if (props.currentUser?.role === 'admin') {
        return roles.value
      }
      return props.type === 'group'
        ? [UserGroupRoleOptions.MEMBER, UserGroupRoleOptions.GROUP_ADMIN]
        : [ProjectRoleOptions.MEMBER, ProjectRoleOptions.MANAGER]
    })

    const currentPageData = computed(() => {
      return props.members.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
    })

    const shouldShowEmails = computed(() => {
      return props.members.some((m) => m.user.email != null)
    })

    const canEditRoleFor = (user: Member) => {
      return (
        props.canEdit &&
        props.currentUser &&
        (props.currentUser.role === 'admin' ||
          (props.currentUser.id !== user?.user?.id && allowedRoles.value.includes(user?.role as any)))
      )
    }

    const datasetsListLink = (user: Member['user']) => {
      return {
        path: '/datasets',
        query: encodeParams({
          ...props.filter,
          submitter: user?.id,
        }),
      }
    }

    // Emit events
    const handleRemoveUser = (user: Member) => emit('removeUser', user)
    const handleCancelInvite = (user: Member) => emit('cancelInvite', user)
    const handleAcceptUser = (user: Member) => emit('acceptUser', user)
    const handleRejectUser = (user: Member) => emit('rejectUser', user)
    const handleAddMember = () => emit('addMember')
    const handleEditRole = (user: Member) => {
      editingRoleOfMember.value = user
      newRole.value = user?.role
    }
    const handleCloseEditRole = () => {
      editingRoleOfMember.value = null
      newRole.value = null
    }
    const handleUpdateRole = () => {
      if (editingRoleOfMember.value) {
        emit('updateRole', editingRoleOfMember.value, newRole.value)
        handleCloseEditRole()
      }
    }

    return {
      pageSize,
      page,
      editingRoleOfMember,
      newRole,
      getRoleName,
      roles,
      allowedRoles,
      currentPageData,
      shouldShowEmails,
      canEditRoleFor,
      datasetsListLink,
      handleRemoveUser,
      handleCancelInvite,
      handleAcceptUser,
      handleRejectUser,
      handleAddMember,
      handleEditRole,
      handleCloseEditRole,
      handleUpdateRole,
    }
  },
})
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
