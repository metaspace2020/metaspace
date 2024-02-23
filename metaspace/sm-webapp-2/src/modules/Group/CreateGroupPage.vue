<template>
  <div v-if="canCreate" class="page">
    <div class="page-content max-w-4xl px-5">
      <div class="header-row px-18 py-2">
        <h1>Create Group</h1>
        <div class="flex-spacer" />

        <div class="header-row-buttons">
          <el-button type="primary" :loading="isSaving" @click="handleSave"> Create </el-button>
        </div>
      </div>
      <edit-group-form
        ref="formRef"
        class="px-18"
        :model-value="model"
        :disabled="isSaving"
        show-group-admin
        @update:modelValue="handleUpdate"
      />
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, ref, computed, reactive } from 'vue'
import { useQuery, useMutation } from '@vue/apollo-composable'
import { useRouter } from 'vue-router'
import EditGroupForm from './EditGroupForm.vue'
import { createGroupMutation, UserGroupRole } from '../../api/group'
import { currentUserRoleQuery, UserRole } from '../../api/user'
import reportError from '../../lib/reportError'
import { ElMessage } from 'element-plus'

interface CurrentUserQuery {
  id: string
  role: UserRole
}
export default defineComponent({
  components: {
    EditGroupForm,
  },
  setup() {
    const router = useRouter()
    const formRef = ref(null)
    const isSaving = ref(false)
    const model = reactive({
      name: '',
      shortName: '',
      groupAdminEmail: '',
    })

    const roleNames: Record<UserGroupRole, string> = {
      GROUP_ADMIN: 'Group admin',
      MEMBER: 'Member',
      PENDING: 'Requesting access',
      INVITED: 'Invited',
    }

    const { result: currentUserResult } = useQuery(currentUserRoleQuery)
    const currentUser = computed((): CurrentUserQuery | null => currentUserResult.value?.currentUser)
    const createGroup = useMutation(createGroupMutation)

    const canCreate = computed(() => {
      return currentUser.value && currentUser.value.id // && currentUser.value.role === 'admin'
    })

    const handleUpdate = (newModel) => {
      Object.assign(model, newModel)
    }

    const handleSave = async () => {
      isSaving.value = true
      try {
        await (formRef.value as any).validate()

        try {
          await createGroup.mutate({ groupDetails: model })
          ElMessage({ message: `${model.name} was created`, type: 'success', offset: 80 })
          await router.push({
            path: '/groups',
          })
        } catch (err) {
          reportError(err)
        }
      } catch {
        // validation error
      } finally {
        isSaving.value = false
      }
    }

    return {
      isSaving,
      model,
      currentUser,
      roleNames,
      canCreate,
      handleSave,
      formRef,
      handleUpdate,
    }
  },
})
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
