<template>
  <div class="metadata-section">
    <find-group-dialog :visible="showFindGroupDialog" @close="hideFindGroupDialog" @selectGroup="handleSelectGroup" />
    <create-project-dialog
      v-if="currentUser != null"
      :visible="showCreateProjectDialog"
      :current-user-id="currentUser.id"
      @close="hideCreateProjectDialog"
      @create="handleSelectProject"
    />
    <el-row>
      <el-col :span="6">
        <div class="metadata-section__title">Data management</div>
      </el-col>
      <el-col :span="18">
        <el-row :gutter="8">
          <el-form class="w-full flex flex-wrap" size="default" label-position="top">
            <el-col v-if="isAdmin" :span="16" :offset="8" :pull="8">
              <form-field
                :value="(submitter && `${submitter.name} (${submitter.email})`) || null"
                type="autocomplete"
                name="Submitter"
                :fetch-suggestions="handleSearchUsers"
                required
                @select="handleSelectSubmitter"
              />
            </el-col>
            <el-col v-else :span="8">
              <form-field
                type="text"
                name="Submitter name"
                :value="submitter != null ? submitter.name : ''"
                required
                disabled
              />
            </el-col>
            <el-col :span="8">
              <form-field
                :value="groupId"
                :error="error && error.groupId"
                :options="groupOptions"
                type="select"
                placeholder="Select your group"
                name="Group"
                required
                @input="setGroupId"
              />
            </el-col>
            <el-col :span="8">
              <form-field
                v-model="projectIds"
                :error="error && error.projectIds"
                :options="projectOptions"
                type="selectMulti"
                name="Projects"
                @input="(val) => setProjectIds(val)"
              />
            </el-col>
          </el-form>
        </el-row>
      </el-col>
    </el-row>
    <el-collapse-transition class="mt-8">
      <el-row v-if="showPI && groupId == 'NO_GROUP'">
        <el-col :span="6">
          <div class="metadata-section__title">Principal Investigator</div>
        </el-col>
        <el-col :span="18">
          <el-row :gutter="8">
            <el-form size="default" class="w-full" label-position="top">
              <el-col :span="8">
                <form-field
                  type="text"
                  name="Full name"
                  :value="value.principalInvestigator ? value.principalInvestigator.name : ''"
                  :error="error && error.principalInvestigator && error.principalInvestigator.name"
                  required
                  @input="(value) => handleInputPI('name', value)"
                />
              </el-col>
              <el-col :span="8">
                <form-field
                  type="text"
                  name="Email address"
                  :value="value.principalInvestigator ? value.principalInvestigator.email : ''"
                  :error="error && error.principalInvestigator && error.principalInvestigator.email"
                  required
                  @input="(value) => handleInputPI('email', value)"
                />
              </el-col>
            </el-form>
          </el-row>
        </el-col>
      </el-row>
      <el-row v-else>
        <el-col :span="6">
          <span class="metadata-section__title">Subscription limits</span>
        </el-col>
        <el-col :span="18">
          <group-quota :groupId="groupId" />
        </el-col>
      </el-row>
    </el-collapse-transition>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch, computed, inject } from 'vue'
import { useQuery, DefaultApolloClient } from '@vue/apollo-composable'
import FormField from '../inputs/FormField.vue'
import FindGroupDialog from './FindGroupDialog.vue'
import CreateProjectDialog from '../../Project/CreateProjectDialog.vue'
import { currentUserRoleQuery, DatasetSubmitterFragment } from '../../../api/user'
import { GroupListItem, oneGroupQuery, oneProjectQuery } from '../../../api/dataManagement'
import './FormSection.scss'
import gql from 'graphql-tag' // imported directly so that the Project pages aren't pulled into the bundle
import { MetaspaceOptions } from '../formStructure'
import { ElRow, ElCol, ElForm, ElCollapseTransition } from '../../../lib/element-plus'
import GroupQuota from '../../Group/GroupQuota'

const FIND_GROUP = 'FIND_GROUP'
const NO_GROUP = 'NO_GROUP'
const CREATE_PROJECT = 'CREATE_PROJECT'

interface SubmitterOption {
  id: string
  value: string
}

export default defineComponent({
  name: 'DataManagementSection',
  components: {
    FormField,
    FindGroupDialog,
    ElRow,
    ElCol,
    ElForm,
    ElCollapseTransition,
    CreateProjectDialog,
    GroupQuota,
  },
  props: {
    value: { type: Object as () => MetaspaceOptions, required: true },
    submitter: { type: Object as () => DatasetSubmitterFragment | null, default: null },
    error: { type: Object as () => any, default: () => ({}) },
  },
  setup(props, { emit }) {
    const apolloClient = inject(DefaultApolloClient)

    const unknownGroup = ref<GroupListItem | null>(null)
    const unknownProjects = ref<{ id: string; name: string }[]>([])
    const showFindGroupDialog = ref(false)
    const showCreateProjectDialog = ref(false)
    const loading = ref(false)
    const hasSelectedNoGroup = ref(false)
    const lastPrincipalInvestigator = ref<MetaspaceOptions['principalInvestigator'] | null>(null)

    const { result: currentUserResult } = useQuery(currentUserRoleQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const fetchGroupIfUnknown = async () => {
      // If the dataset is saved with a groupId for a group that the user isn't a member of, or the group
      // was selected through the find dialog, the drop-down list won't have an entry for it, so do an extra query for it.
      const groupId = props.value.groupId
      if (groupIdIsUnknown.value && (!unknownGroup.value || unknownGroup.value.id !== groupId)) {
        const { data } = await apolloClient.query({
          query: oneGroupQuery,
          variables: { groupId },
        })
        // Double-check the value hasn't changed before setting unknownGroup
        if (props.value.groupId === groupId) {
          unknownGroup.value = data.group
        }
      }
    }

    const fetchProjectsIfUnknown = async () => {
      if (props.submitter == null) return // Still loading

      const loadedProjects = props.submitter.projects || []
      const projectIds = props.value.projectIds || []
      const unknownProjectIds = projectIds.filter(
        (id) => loadedProjects == null || !loadedProjects.some((project) => project.project.id === id)
      )

      if (unknownProjectIds.length > 0) {
        const promises = unknownProjectIds.map((projectId) =>
          apolloClient.query({
            query: oneProjectQuery,
            variables: { projectId },
          })
        )
        const datas = await Promise.all(promises)
        if (props.value.projectIds === projectIds) {
          unknownProjects.value = datas.map(({ data }) => data.project)
        }
      }
    }
    const fetchUnknowns = () => {
      fetchGroupIfUnknown()
      fetchProjectsIfUnknown()
    }

    const isAdmin = computed(() => currentUser.value != null && currentUser.value.role === 'admin')
    const showPI = computed(() => hasSelectedNoGroup.value || props.value.principalInvestigator != null)
    const groupIdIsUnknown = computed(() => {
      return (
        props.value.groupId != null &&
        props.submitter != null &&
        (props.submitter.groups == null ||
          !props.submitter.groups.some((group) => group.group.id === props.value.groupId))
      )
    })

    const groupId = computed(() => {
      if (props.value.groupId != null) {
        return props.value.groupId
      } else if (showPI.value) {
        return NO_GROUP
      } else {
        return null
      }
    })

    const setGroupId = (value: string | null) => {
      let groupId = props.value.groupId
      let principalInvestigator = props.value.principalInvestigator

      // Remove PI only if changing away from the "No group" option, to prevent data loss in case we somehow get
      // datasets with both a group and PI
      if (groupId == null && value !== NO_GROUP) {
        principalInvestigator = null
      }
      hasSelectedNoGroup.value = value === NO_GROUP

      if (value === NO_GROUP) {
        groupId = null
        if (principalInvestigator == null) {
          principalInvestigator = lastPrincipalInvestigator.value || { name: '', email: '' }
        }
      } else if (value === FIND_GROUP) {
        groupId = null
        showFindGroupDialog.value = true
      } else {
        groupId = value
      }

      emit('change', { field: 'groupId', val: groupId })
      emit('change', { field: 'principalInvestigator', val: principalInvestigator })
    }

    const projectIds = computed(() => {
      return props.value.projectIds
    })

    const setProjectIds = (projectIds: string[]) => {
      if (projectIds.includes(CREATE_PROJECT)) {
        showCreateProjectDialog.value = true
      } else {
        emit('change', { field: 'projectIds', val: projectIds })
      }
    }

    const groupOptions = computed(() => {
      const groups = (props.submitter != null && props.submitter.groups) || []
      const options = groups.map(({ group: { id, name } }) => ({
        value: id,
        label: name,
      }))
      if (groupIdIsUnknown.value && unknownGroup.value != null && unknownGroup.value.id === props.value.groupId) {
        options.push({ value: unknownGroup.value.id, label: unknownGroup.value.name })
      }
      if (props.submitter != null && currentUser.value != null && props.submitter.id === currentUser.value.id) {
        options.push({ value: FIND_GROUP, label: 'Find my group...' })
      }
      options.push({ value: NO_GROUP, label: 'No group (Enter PI instead)' })

      return options
    })

    const projectOptions = computed(() => {
      const projects = (props.submitter != null && props.submitter.projects) || []
      const options = projects.map(({ project: { id, name } }) => ({
        value: id,
        label: name,
      }))
      unknownProjects.value.forEach((project) => {
        if (!projects.some((p2) => project.id === p2.project.id)) {
          options.push({ value: project.id, label: project.name })
        }
      })
      options.push({ value: CREATE_PROJECT, label: 'Create a new project...' })
      return options
    })

    const backupPI = () => {
      // Save the PI in case user selects a group then changes their mind
      if (props.value.principalInvestigator != null) {
        lastPrincipalInvestigator.value = props.value.principalInvestigator
      }
    }

    const handleInputPI = (field: 'name' | 'email', value: string) => {
      const principalInvestigator = {
        ...props.value.principalInvestigator,
        [field]: value,
      }
      emit('change', { field: 'principalInvestigator', val: principalInvestigator })
    }
    const onInput = (field: keyof MetaspaceOptions, val: any) => {
      emit('change', { field, val })
    }

    const hideFindGroupDialog = () => {
      showFindGroupDialog.value = false
    }

    const hideCreateProjectDialog = () => {
      showCreateProjectDialog.value = false
    }
    const handleSelectGroup = async (group: { id: string; name: string } | null) => {
      if (group != null) {
        setGroupId(group.id)
        unknownGroup.value = group
      } else {
        const principalInvestigator = props.value.principalInvestigator ||
          lastPrincipalInvestigator.value || { name: '', email: '' }
        emit('change', { field: 'principalInvestigator', val: principalInvestigator })
        emit('change', { field: 'groupId', val: null })
      }
      showFindGroupDialog.value = false
    }

    const handleSelectProject = async (project: { id: string; name: string }) => {
      unknownProjects.value.push(project)
      setProjectIds([...props.value.projectIds, project.id])
      showCreateProjectDialog.value = false
    }

    const handleSelectSubmitter = (option: SubmitterOption) => {
      emit('change', { field: 'submitterId', val: option.id })
    }

    const handleSearchUsers = async (q: string, cb: any) => {
      const result = await apolloClient.query({
        query: gql`
          query ($query: String!) {
            allUsers(query: $query) {
              id
              name
              email
            }
          }
        `,
        variables: { query: q },
      })
      const users: { id: string; name: string; email: string }[] = result.data.allUsers
      cb(
        users.map((u) => ({
          id: u.id,
          value: `${u.name} (${u.email})`,
        }))
      )
    }

    watch(() => props.submitter, fetchUnknowns)
    watch(() => props.value.groupId, fetchGroupIfUnknown)
    watch(() => props.value.projectIds, fetchProjectsIfUnknown)
    watch(() => props.value.principalInvestigator, backupPI)

    onMounted(() => {
      fetchUnknowns()
    })

    return {
      currentUser,
      unknownGroup,
      unknownProjects,
      showFindGroupDialog,
      showCreateProjectDialog,
      loading,
      hasSelectedNoGroup,
      lastPrincipalInvestigator,
      isAdmin,
      showPI,
      hideFindGroupDialog,
      handleSelectGroup,
      hideCreateProjectDialog,
      handleSelectProject,
      handleSearchUsers,
      handleSelectSubmitter,
      groupId,
      groupOptions,
      projectIds,
      projectOptions,
      handleInputPI,
      onInput,
      setGroupId,
      setProjectIds,
    }
  },
})
</script>
