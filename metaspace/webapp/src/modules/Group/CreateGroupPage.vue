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
import { currentUserEmailRoleQuery, UserRole } from '../../api/user'
import reportError from '../../lib/reportError'
import { ElMessage } from '../../lib/element-plus'

interface CurrentUserQuery {
  id: string
  role: UserRole
  email: string
}

interface CurrentUserResult {
  currentUser: CurrentUserQuery | null
}
export default defineComponent({
  components: {
    EditGroupForm,
  },
  props: {
    isModal: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['groupCreated'],
  setup(props, { emit }) {
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

    const { result: currentUserResult, onResult: onCurrentUserResult } =
      useQuery<CurrentUserResult>(currentUserEmailRoleQuery)
    const currentUser = computed((): CurrentUserQuery | null => currentUserResult.value?.currentUser || null)
    const { mutate: createGroupMutate } = useMutation(createGroupMutation)

    onCurrentUserResult(() => {
      model.groupAdminEmail = currentUser.value?.email
    })

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
          const result = await createGroupMutate({ groupDetails: model })

          if (props.isModal) {
            // Emit the created group data when used as modal
            emit('groupCreated', (result as any)?.createGroup)
          } else {
            // Show success message and navigate when used as standalone page
            ElMessage({ message: `${model.name} was created`, type: 'success', offset: 80 })
            await router.push({
              path: '/groups',
            })
          }
        } catch (err: any) {
          if (err?.graphQLErrors?.[0]?.message) {
            ElMessage({ message: err.graphQLErrors[0].message, type: 'error', offset: 80 })
          }
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
  height: 100%;
  // min-height: 80vh; // Ensure there's space for the loading spinner before is visible
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
