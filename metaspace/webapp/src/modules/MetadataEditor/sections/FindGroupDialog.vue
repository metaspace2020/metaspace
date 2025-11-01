<template>
  <el-dialog
    class="find-group-dialog"
    :model-value="visible"
    append-to-body
    title="Create project"
    :lock-scroll="false"
    @close="handleClose"
  >
    <h2>Find a group</h2>
    <p>
      If you are not member of a group, you can request access here and your dataset will be automatically added to the
      group once your access has been approved.
    </p>
    <el-form>
      <el-form-item :error="groupIdError" label="Your group:">
        <el-row>
          <el-select
            v-model="groupId"
            filterable
            remote
            :remote-method="handleGroupSearch"
            placeholder="Enter group name"
            :loading="searchLoading !== 0"
          >
            <el-option v-for="group in searchResults" :key="group.id" :label="group.name" :value="group.id" />
          </el-select>
        </el-row>
      </el-form-item>
    </el-form>

    <el-row style="margin: 15px 0">
      <el-button @click="handleClose"> Cancel </el-button>
      <el-button
        type="primary"
        :disabled="groupId == null || groupIdError != null"
        :loading="isGroupAccessLoading"
        @click="handleRequestGroupAccess"
      >
        Request access
      </el-button>
    </el-row>
    <el-row>
      <p>
        <b>Can't find your group?</b> <a href="mailto:contact@metaspace2020.org">Contact us</a> to get your team
        started, or
        <a href="#" style="cursor: pointer" @click.prevent="handleSelectNoGroup">fill in your Principal Investigator</a>
        instead.
      </p>
    </el-row>
  </el-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, watch, computed, inject } from 'vue'
import { useQuery, DefaultApolloClient } from '@vue/apollo-composable'
import { UserGroupRoleOptions as UGRO } from '../../../api/group'
import { userProfileQuery } from '../../../api/user'
import reportError from '../../../lib/reportError'
import { allGroupsQuery, requestAccessToGroupMutation } from '../../../api/dataManagement'
import { ElMessage, ElRow, ElDialog, ElForm, ElFormItem, ElSelect, ElButton } from '../../../lib/element-plus'

export default defineComponent({
  name: 'FindGroupDialog',
  components: {
    ElRow,
    ElDialog,
    ElForm,
    ElFormItem,
    ElSelect,
    ElButton,
  },
  props: {
    visible: { type: Boolean, default: false },
  },
  setup(props, { emit }) {
    const query = ref('')
    const searchLoading = ref(0)
    const isGroupAccessLoading = ref(false)
    const groupId = ref<string | null>(null)
    const apolloClient = inject(DefaultApolloClient)

    const { result: currentUserResult } = useQuery(userProfileQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const { result: searchResult, refetch } = useQuery(allGroupsQuery, () => ({ query: query.value }), {
      fetchPolicy: 'cache-first',
      enabled: query.value !== '',
    })
    const searchResults = computed(() => searchResult.value?.allGroups)

    watch(
      () => props.visible,
      () => {
        console.log(props.visible)
        if (props.visible) {
          // Refresh the data when the dialog becomes visible
          refetch()
        }
      }
    )

    const groupIdError = computed(() => {
      if (currentUser.value != null && currentUser.value.groups != null) {
        const existingUserGroup = currentUser.value.groups.find((g) => g.group.id === groupId.value)
        if (existingUserGroup != null) {
          if (existingUserGroup.role === UGRO.PENDING) {
            return 'You have already requested access to this group.'
          } else if (existingUserGroup.role === UGRO.INVITED) {
            return 'You have already been invited this group. Please accept the invitation through your account page.'
          } else {
            return 'You are already a member of this group.'
          }
        }
      }
      return null
    })

    const handleSelectNoGroup = () => {
      emit('selectGroup', null)
    }

    const handleGroupSearch = (queryValue: string) => {
      query.value = queryValue
    }

    const handleClose = () => {
      emit('close')
    }

    const handleRequestGroupAccess = async () => {
      try {
        const group = searchResults.value!.find((g) => g.id === groupId.value)
        isGroupAccessLoading.value = true
        await apolloClient.mutate({
          mutation: requestAccessToGroupMutation,
          variables: { groupId: groupId.value },
        })
        await apolloClient.queries.currentUser.refetch()

        ElMessage({
          message: 'Your request was successfully sent!',
          type: 'success',
        })
        emit('selectGroup', group)
      } catch (err) {
        reportError(err)
      } finally {
        isGroupAccessLoading.value = false
        groupId.value = null
      }
    }

    return {
      query,
      searchResults,
      currentUser,
      searchLoading,
      isGroupAccessLoading,
      groupId,
      groupIdError,
      handleSelectNoGroup,
      handleGroupSearch,
      handleClose,
      handleRequestGroupAccess,
    }
  },
})
</script>

<style lang="scss">
.find-group-dialog {
  .el-dialog__body {
    padding: 10px 25px;
  }
  .el-select .el-input__inner {
    cursor: text;
  }
  .el-select .el-input__suffix {
    display: none;
  }
}
</style>
