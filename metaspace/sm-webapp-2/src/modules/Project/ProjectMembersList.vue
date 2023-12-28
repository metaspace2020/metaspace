<template>
  <members-list
    :loading="loading || loadingInternal"
    :current-user="currentUser"
    :members="sortedMembers"
    type="project"
    :filter="datasetsListFilter"
    :can-edit="canEdit"
    @removeUser="handleRemoveUser"
    @cancelInvite="handleRemoveUser"
    @acceptUser="handleAcceptUser"
    @rejectUser="handleRejectUser"
    @addMember="handleAddMember"
    @updateRole="handleUpdateRole"
  />
</template>

<script lang="ts">
import {defineComponent, reactive, toRefs, computed, inject} from 'vue';
import { sortBy } from 'lodash-es';
import MembersList from '../../components/MembersList.vue';
import {
  acceptRequestToJoinProjectMutation,
  ViewProjectMember,
  inviteUserToProjectMutation,
  ProjectRole,
  ProjectRoleOptions as PRO,
  removeUserFromProjectMutation,
  updateUserProjectMutation,
} from '../../api/project'
import { CurrentUserRoleResult } from '../../api/user'
import emailRegex from '../../lib/emailRegex';
import {DefaultApolloClient} from "@vue/apollo-composable";
import { useConfirmAsync } from '../../components/ConfirmAsync'

interface ProjectInfo {
  id: string;
  name: string;
  currentUserRole: ProjectRole;
}

export default defineComponent({
  name: 'ProjectMembersList',
  components: {
    MembersList
  },
  props: {
    currentUser: Object as () => CurrentUserRoleResult | null,
    project: Object as () => ProjectInfo | null,
    members: {
      type: Array as () => ViewProjectMember[],
      required: true
    },
    loading: Boolean,
    refreshData: Function
  },
  setup(props) {
    const apolloClient = inject(DefaultApolloClient);
    const state = reactive({
      loadingInternal: false
    });
    const confirmAsync = useConfirmAsync();

    const projectId = computed(() => props.project?.id);
    const projectName = computed(() => props.project?.name);

    const canEdit = computed(() => {
      return props.currentUser?.role === 'admin' ||
        props.project?.currentUserRole === 'MANAGER';
    });

    const datasetsListFilter = computed(() => ({
      project: projectId.value
    }));

    const sortedMembers = computed(() => {
      const roleOrder = [PRO.MANAGER, PRO.MEMBER, PRO.PENDING, PRO.INVITED];
      return sortBy(props.members, m => roleOrder.indexOf(m.role));
    });

    const handleRemoveUser = async (member: ViewProjectMember) => {
      const confirmOptions = {
        message: `Are you sure you want to remove ${member.user.name} from ${projectName.value}?`,
        confirmButtonText: 'Remove user',
        confirmButtonLoadingText: 'Removing...',
      };

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: removeUserFromProjectMutation,
          variables: { projectId: projectId.value, userId: member.user.id },
        })
        await props.refreshData()
      });
    }

    const handleAcceptUser = async (member: ViewProjectMember) => {
      const confirmOptions = {
        message: `This will allow ${member.user.name} to access all private datasets that are in ${projectName.value}. `
          + 'Are you sure you want to accept them into the project?',
        confirmButtonText: 'Accept request',
        confirmButtonLoadingText: 'Accepting...',
      };

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: acceptRequestToJoinProjectMutation,
          variables: { projectId: projectId.value, userId: member.user.id },
        })
        await props.refreshData()
      });
    }

    const handleRejectUser = async (member: ViewProjectMember) => {
      const confirmOptions = {
        message: `Are you sure you want to decline ${member.user.name}'s request for access to ${projectName.value}?`,
        confirmButtonText: 'Decline request',
        confirmButtonLoadingText: 'Declining...',
      };

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: removeUserFromProjectMutation,
          variables: { projectId: projectId.value, userId: member.user.id },
        })
        await props.refreshData()
      });
    }

    const handleAddMember = async (email: string) => {
      const confirmOptions = {
        title: 'Add member',
        message: 'An email will be sent inviting them to join the project. If they accept the invitation, '
          + `they will be able to access the private datasets of ${projectName.value}.`,
        showInput: true,
        inputPlaceholder: 'Email address',
        inputPattern: emailRegex,
        inputErrorMessage: 'Please enter a valid email address',
        confirmButtonText: 'Invite to project',
        confirmButtonLoadingText: 'Sending invitation...',
      };

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: inviteUserToProjectMutation,
          variables: { projectId: projectId.value, email },
        })
        await props.refreshData()
      });
    }

    const handleUpdateRole = async(member: ViewProjectMember, role: ProjectRole | null) => {
      try {
        state.loadingInternal = true
        await apolloClient.mutate({
          mutation: updateUserProjectMutation,
          variables: {
            projectId: projectId.value,
            userId: member.user.id,
            update: { role },
          },
        })
        await props.refreshData()
      } finally {
        state.loadingInternal = false
      }
    }

    return {
      ...toRefs(state),
      projectId,
      projectName,
      canEdit,
      datasetsListFilter,
      sortedMembers,
      handleAcceptUser,
      handleRemoveUser,
      handleRejectUser,
      handleAddMember,
      handleUpdateRole,
    };
  }
});
</script>
