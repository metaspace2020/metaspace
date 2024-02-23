<template>
  <el-row>
    <create-project-dialog
      v-if="currentUser"
      :visible="showCreateProjectDialog && currentUser != null"
      :current-user-id="currentUser.id"
      @close="handleCloseCreateProjectDialog"
      @create="handleCreateProject"
    />
    <table class="sm-table sm-table-user-details">
      <tr>
        <th>Project</th>
        <th>Role</th>
        <th>Datasets</th>
        <th />
      </tr>
      <tr v-for="row in rows" :key="row.id">
        <td>
          <div class="sm-table-cell">
            <router-link :to="row.route">
              {{ row.name }}
            </router-link>
            <notification-icon
              v-if="row.hasPendingRequest"
              :tooltip="`${row.name} has a pending membership request.`"
              tooltip-placement="right"
            />
          </div>
        </td>
        <td>
          {{ row.roleName }}
        </td>
        <td>
          <router-link v-if="row.numDatasets > 0" :to="row.datasetsRoute">
            {{ row.numDatasets }}
          </router-link>
          <span v-if="row.numDatasets === 0">{{ row.numDatasets }}</span>
        </td>
        <td>
          <el-button v-if="row.role === 'MEMBER'" size="small" icon="ArrowRight" @click="handleLeave(row)">
            Leave
          </el-button>
          <el-button v-if="row.role === 'MANAGER'" size="small" icon="ArrowRight" disabled> Leave </el-button>
          <el-button
            v-if="row.role === 'INVITED'"
            size="small"
            type="success"
            icon="Check"
            @click="handleAcceptInvitation(row)"
          >
            Accept
          </el-button>
          <el-button v-if="row.role === 'INVITED'" size="small" icon="Close" @click="handleDeclineInvitation(row)">
            Decline
          </el-button>
        </td>
      </tr>
    </table>
    <el-row>
      <el-button ref="createBtnRef" style="float: right; margin: 10px 0" @click="handleOpenCreateProjectDialog">
        Create project
      </el-button>
    </el-row>
  </el-row>
</template>

<script lang="ts">
import './Table.css'
import { defineComponent, ref, computed, inject } from 'vue'
import { UserProfileQuery } from '../../api/user'
import { acceptProjectInvitationMutation, getRoleName, leaveProjectMutation, ProjectRole } from '../../api/project'
import reportError from '../../lib/reportError'
import { useConfirmAsync } from '../../components/ConfirmAsync'
import NotificationIcon from '../../components/NotificationIcon.vue'
import { encodeParams } from '../Filters'
import { CreateProjectDialog } from '../Project'
import { ElMessage } from 'element-plus'
import { DefaultApolloClient } from '@vue/apollo-composable'
import { useRouter } from 'vue-router'
import { ElButton, ElRow } from 'element-plus'

interface ProjectRow {
  id: string
  name: string
  role: ProjectRole
  roleName: string
  numDatasets: number
  route: any
  datasetsRoute: any
}

export default defineComponent({
  name: 'ProjectsTable',
  components: {
    CreateProjectDialog,
    NotificationIcon,
    ElButton,
    ElRow,
  },
  props: {
    currentUser: Object as () => UserProfileQuery | null,
    refetchData: Function as () => void,
  },
  setup(props) {
    const apolloClient = inject(DefaultApolloClient)
    const router = useRouter()
    const createBtnRef = ref(null)
    const showTransferDatasetsDialog = ref(false)
    const showCreateProjectDialog = ref(false)
    const invitingProject = ref<ProjectRow | null>(null)
    const confirmAsync = useConfirmAsync()

    const rows = computed(() => {
      if (props.currentUser != null && props.currentUser.projects != null) {
        return props.currentUser.projects.map((item: any) => {
          const { project, numDatasets, role } = item
          const { id, name, urlSlug, hasPendingRequest } = project

          return {
            id,
            name,
            role,
            numDatasets,
            hasPendingRequest,
            roleName: getRoleName(role),
            route: {
              name: 'project',
              params: { projectIdOrSlug: urlSlug || id },
            },
            datasetsRoute: {
              path: '/datasets',
              query: encodeParams({ submitter: props.currentUser!.id, project: id }),
            },
          }
        })
      }
      return []
    })

    const handleLeave = async (projectRow: ProjectRow) => {
      const confirmOptions = {
        message: `Are you sure you want to leave ${projectRow.name}?`,
        confirmButtonText: 'Yes, leave the project',
        confirmButtonLoadingText: 'Leaving...',
      }

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: leaveProjectMutation,
          variables: { projectId: projectRow.id },
        })
        await props.refetchData()
        ElMessage({ message: 'You have successfully left the project' })
      })
    }

    const handleDeclineInvitation = async (projectRow: ProjectRow) => {
      const confirmOptions = {
        message: `Are you sure you want to decline the invitation to ${projectRow.name}?`,
        confirmButtonText: 'Yes, decline the invitation',
        confirmButtonLoadingText: 'Leaving...',
      }

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: leaveProjectMutation,
          variables: { projectId: projectRow.id },
        })
        await props.refetchData()
        ElMessage({ message: 'You have declined the invitation' })
      })
    }

    const handleAcceptInvitation = async (projectRow: ProjectRow) => {
      try {
        await apolloClient.mutate({
          mutation: acceptProjectInvitationMutation,
          variables: { projectId: projectRow.id },
        })
        await props.refetchData()
        ElMessage({
          type: 'success',
          message: `You are now a member of ${projectRow.name}`,
        })
      } catch (err) {
        reportError(err)
      } finally {
        showTransferDatasetsDialog.value = false
      }
    }

    const handleOpenCreateProjectDialog = () => {
      // blur on open dialog, so the dialog button can be focused
      const createBtn: any = createBtnRef.value as any
      createBtn.$el.blur()
      showCreateProjectDialog.value = true
    }

    const handleCloseCreateProjectDialog = () => {
      showCreateProjectDialog.value = false
    }

    const handleCreateProject = ({ id }: { id: string }) => {
      router.push({ name: 'project', params: { projectIdOrSlug: id } })
    }

    return {
      createBtnRef,
      showTransferDatasetsDialog,
      showCreateProjectDialog,
      invitingProject,
      rows,
      handleLeave,
      handleAcceptInvitation,
      handleDeclineInvitation,
      handleOpenCreateProjectDialog,
      handleCloseCreateProjectDialog,
      handleCreateProject,
    }
  },
})
</script>

<style scoped>
.table.el-table ::v-deep(.cell) {
  word-break: normal !important;
}
</style>
