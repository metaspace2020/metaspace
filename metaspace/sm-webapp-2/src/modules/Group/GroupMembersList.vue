<template>
  <members-list
    :loading="loading || loadingInternal"
    :current-user="currentUser"
    :members="sortedMembers"
    type="group"
    :filter="datasetsListFilter"
    :can-edit="canEdit"
    @removeUser="handleRemoveUser"
    @cancelInvite="handleRemoveUser"
    @acceptUser="handleAcceptUser"
    @rejectUser="handleRejectUser"
    @addMember="
      () =>
        handleAddMember(/* Discard the event argument. ConfirmAsync adds an argument to the end of the arguments list, so the arguments list must be predictable */)
    "
    @updateRole="handleUpdateRole"
  />
</template>

<script lang="ts">
import { defineComponent, reactive, toRefs, computed, inject } from 'vue'
import { sortBy } from 'lodash-es'
import MembersList from '../../components/MembersList.vue'
import {
  acceptRequestToJoinGroupMutation,
  EditGroupQuery,
  EditGroupQueryMember,
  inviteUserToGroupMutation,
  removeUserFromGroupMutation,
  updateUserGroupMutation,
  UserGroupRole,
  UserGroupRoleOptions as UGRO,
} from '../../api/group'
import { CurrentUserRoleResult } from '../../api/user'
import emailRegex from '../../lib/emailRegex'
import { DefaultApolloClient } from '@vue/apollo-composable'
import { useConfirmAsync } from '../../components/ConfirmAsync'

export default defineComponent({
  name: 'GroupMembersList',
  components: {
    MembersList,
  },
  props: {
    currentUser: Object as () => CurrentUserRoleResult | null,
    group: Object as () => EditGroupQuery | null,
    members: {
      type: Array as () => EditGroupQueryMember[],
      required: true,
    },
    loading: Boolean,
    refreshData: Function,
  },
  setup(props) {
    const apolloClient = inject(DefaultApolloClient)
    const state = reactive({
      loadingInternal: false,
    })
    const confirmAsync = useConfirmAsync()
    const canEdit = computed(() => {
      return props.currentUser?.role === 'admin' || props.group?.currentUserRole === 'GROUP_ADMIN'
    })

    const groupId = computed(() => props.group?.id)
    const groupName = computed(() => props.group?.name)

    const datasetsListFilter = computed(() => ({
      group: groupId.value,
    }))

    const sortedMembers = computed(() => {
      const roleOrder = [UGRO.GROUP_ADMIN, UGRO.MEMBER, UGRO.PENDING, UGRO.INVITED]
      return sortBy(props.members, (m) => roleOrder.indexOf(m.role))
    })

    const handleRemoveUser = async (member: EditGroupQueryMember) => {
      const confirmOptions = {
        message: `Are you sure you want to remove ${member.user.name} from ${groupName.value}?`,
        confirmButtonText: 'Remove user',
        confirmButtonLoadingText: 'Removing...',
      }

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: removeUserFromGroupMutation,
          variables: { groupId: groupId.value, userId: member.user.id },
        })
        await props.refreshData()
      })
    }

    const handleAcceptUser = async (member: EditGroupQueryMember) => {
      const confirmOptions = {
        message:
          `This will allow ${member.user.name} to access all private datasets that are in ${groupName.value}. ` +
          'Are you sure you want to accept them into the group?',
        confirmButtonText: 'Accept request',
        confirmButtonLoadingText: 'Accepting...',
      }

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: acceptRequestToJoinGroupMutation,
          variables: { groupId: groupId.value, userId: member.user.id },
        })
        await props.refreshData()
      })
    }

    const handleRejectUser = async (member: EditGroupQueryMember) => {
      const confirmOptions = {
        message: `Are you sure you want to decline ${member.user.name}'s request for access to ${groupName.value}?`,
        confirmButtonText: 'Decline request',
        confirmButtonLoadingText: 'Declining...',
      }

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: removeUserFromGroupMutation,
          variables: { groupId: groupId.value, userId: member.user.id },
        })
        await props.refreshData()
      })
    }

    const handleAddMember = async () => {
      const confirmOptions = {
        title: 'Add member',
        message:
          'An email will be sent inviting them to join the group. ' +
          `If they accept the invitation, they will be able to access the private datasets of ${groupName.value}.`,
        showInput: true,
        inputPlaceholder: 'Email address',
        inputPattern: emailRegex,
        inputErrorMessage: 'Please enter a valid email address',
        confirmButtonText: 'Invite to group',
        confirmButtonLoadingText: 'Sending invitation...',
      }

      await confirmAsync(confirmOptions, async (params) => {
        const email: string = params.value
        await apolloClient.mutate({
          mutation: inviteUserToGroupMutation,
          variables: { groupId: groupId.value, email },
        })
        await props.refreshData()
      })
    }

    const handleUpdateRole = async (member: EditGroupQueryMember, role: UserGroupRole | null | string) => {
      try {
        state.loadingInternal = true
        await apolloClient.mutate({
          mutation: updateUserGroupMutation,
          variables: {
            groupId: groupId.value,
            userId: member.user.id,
            update: { role: role === '' ? null : role },
          },
        })
        await props.refreshData()
      } finally {
        state.loadingInternal = false
      }
    }

    return {
      ...toRefs(state),
      groupId,
      groupName,
      canEdit,
      datasetsListFilter,
      sortedMembers,
      handleAcceptUser,
      handleRemoveUser,
      handleRejectUser,
      handleAddMember,
      handleUpdateRole,
    }
  },
})
</script>
