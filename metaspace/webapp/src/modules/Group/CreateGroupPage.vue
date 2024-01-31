<template>
  <div
    v-if="canCreate"
    class="page"
  >
    <div class="page-content  max-w-4xl px-5">
      <div class="header-row px-18 py-2">
        <h1>Create Group</h1>
        <div class="flex-spacer" />

        <div class="header-row-buttons">
          <el-button
            type="primary"
            :loading="isSaving"
            @click="handleSave"
          >
            Create
          </el-button>
        </div>
      </div>
      <edit-group-form
        ref="form"
        class="px-18"
        :model="model"
        :disabled="isSaving"
        show-group-admin
      />
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component } from 'vue-property-decorator'
import { createGroupMutation, UserGroupRole } from '../../api/group'
import EditGroupForm from './EditGroupForm.vue'
import { currentUserRoleQuery, UserRole } from '../../api/user'
import reportError from '../../lib/reportError'

  interface CurrentUserQuery {
    id: string;
    role: UserRole;
  }

  @Component({
    components: {
      EditGroupForm,
    },
    apollo: {
      currentUser: {
        query: currentUserRoleQuery,
        fetchPolicy: 'cache-first',
      },
    },
  })
export default class CreateGroupPage extends Vue {
    isSaving = false;
    model = {
      name: '',
      shortName: '',
      groupAdminEmail: '',
    };

    currentUser: CurrentUserQuery | null = null;

    roleNames: Record<UserGroupRole, string> = {
      GROUP_ADMIN: 'Group admin',
      MEMBER: 'Member',
      PENDING: 'Requesting access',
      INVITED: 'Invited',
    };

    get canCreate() {
      return this.currentUser && this.currentUser.id // this.currentUser.role === 'admin' || false
    }

    async handleSave() {
      this.isSaving = true
      try {
        await (this.$refs.form as any).validate()
        try {
          await this.$apollo.mutate({
            mutation: createGroupMutation,
            variables: { groupDetails: this.model },
          })
          this.$message({ message: `${this.model.name} was created`, type: 'success', offset: 80 })
          this.$router.push({
            path: '/groups',
          })
        } catch (err) {
          reportError(err)
        }
      } catch {
        // validation error
      } finally {
        this.isSaving = false
      }
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
