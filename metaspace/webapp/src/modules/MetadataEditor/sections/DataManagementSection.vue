<template>
  <div class="metadata-section">
    <find-group-dialog
      :visible="showFindGroupDialog"
      @close="hideFindGroupDialog"
      @selectGroup="handleSelectGroup"
    />
    <create-project-dialog
      :visible="showCreateProjectDialog && currentUser != null"
      :current-user-id="currentUser && currentUser.id"
      @close="hideCreateProjectDialog"
      @create="handleSelectProject"
    />
    <el-row>
      <el-col :span="6">
        <div class="metadata-section__title">
          Data management
        </div>
      </el-col>
      <el-col :span="18">
        <el-row :gutter="8">
          <el-form
            size="medium"
            label-position="top"
          >
            <el-col
              v-if="isAdmin"
              :span="16"
              :offset="8"
              :pull="8"
            >
              <form-field
                :value="submitter && `${submitter.name} (${submitter.email})` || null"
                type="autocomplete"
                name="Submitter"
                :fetch-suggestions="handleSearchUsers"
                required
                @select="handleSelectSubmitter"
              />
            </el-col>
            <el-col
              v-else
              :span="8"
            >
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
                v-model="groupId"
                :error="error && error.groupId"
                :options="groupOptions"
                type="select"
                placeholder="Select your group"
                name="Group"
                required
              />
            </el-col>
            <el-col :span="8">
              <form-field
                v-model="projectIds"
                :error="error && error.projectIds"
                :options="projectOptions"
                type="selectMulti"
                name="Projects"
              />
            </el-col>
          </el-form>
        </el-row>
      </el-col>
    </el-row>
    <el-collapse-transition>
      <el-row v-if="showPI">
        <el-col :span="6">
          <div class="metadata-section__title">
            Principal Investigator
          </div>
        </el-col>
        <el-col :span="18">
          <el-row :gutter="8">
            <el-form
              size="medium"
              label-position="top"
            >
              <el-col :span="8">
                <form-field
                  type="text"
                  name="Full name"
                  :value="value.principalInvestigator ? value.principalInvestigator.name : ''"
                  :error="error && error.principalInvestigator && error.principalInvestigator.name"
                  required
                  @input="value => handleInputPI('name', value)"
                />
              </el-col>
              <el-col :span="8">
                <form-field
                  type="text"
                  name="Email address"
                  :value="value.principalInvestigator ? value.principalInvestigator.email : ''"
                  :error="error && error.principalInvestigator && error.principalInvestigator.email"
                  required
                  @input="value => handleInputPI('email', value)"
                />
              </el-col>
            </el-form>
          </el-row>
        </el-col>
      </el-row>
    </el-collapse-transition>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop, Watch } from 'vue-property-decorator'
import FormField from '../inputs/FormField.vue'
import { MetaspaceOptions } from '../formStructure'
import { GroupListItem, oneGroupQuery, oneProjectQuery } from '../../../api/dataManagement'
import { currentUserRoleQuery, CurrentUserRoleResult, DatasetSubmitterFragment } from '../../../api/user'
import './FormSection.scss'
import FindGroupDialog from './FindGroupDialog.vue'
import CreateProjectDialog from '../../Project/CreateProjectDialog.vue'
import { FetchSuggestionsCallback } from 'element-ui/types/autocomplete'
import gql from 'graphql-tag' // imported directly so that the Project pages aren't pulled into the bundle

const FIND_GROUP = 'FIND_GROUP'
const NO_GROUP = 'NO_GROUP'
const CREATE_PROJECT = 'CREATE_PROJECT'

  interface SubmitterOption {
    id: string;
    value: string;
  }

  @Component<DataManagementSection>({
    components: {
      FormField,
      FindGroupDialog,
      CreateProjectDialog,
    },
    apollo: {
      currentUser: {
        query: currentUserRoleQuery,
        fetchPolicy: 'cache-first',
      },
    },
  })
export default class DataManagementSection extends Vue {
    @Prop({ type: Object, required: true })
    value!: MetaspaceOptions;

    @Prop(Object)
    submitter!: DatasetSubmitterFragment | null;

    @Prop({ type: Object })
    error?: Record<string, any>;

    $apollo: any; // Type fixes in PR: https://github.com/Akryum/vue-apollo/pull/367

    currentUser: CurrentUserRoleResult | null = null;
    unknownGroup: GroupListItem | null = null;
    unknownProjects: {id: string, name: string}[] = [];
    showFindGroupDialog: boolean = false;
    showCreateProjectDialog: boolean = false;
    loading: boolean = false;
    hasSelectedNoGroup: boolean = false;
    lastPrincipalInvestigator: MetaspaceOptions['principalInvestigator'] = null;

    created() {
      this.fetchUnknowns()
    }

    get isAdmin() {
      return this.currentUser != null && this.currentUser.role === 'admin'
    }

    get showPI() {
      return this.hasSelectedNoGroup || this.value.principalInvestigator != null
    }

    get groupIdIsUnknown() {
      return this.value.groupId != null
        && this.submitter != null
        && (this.submitter.groups == null
            || !this.submitter.groups.some(group => group.group.id === this.value.groupId))
    }

    get groupId() {
      if (this.value.groupId != null) {
        return this.value.groupId
      } else if (this.showPI) {
        return NO_GROUP
      } else {
        return null
      }
    }

    set groupId(value: string | null) {
      let groupId = this.value.groupId
      let principalInvestigator = this.value.principalInvestigator

      // Remove PI only if changing away from the "No group" option, to prevent data loss in case we somehow get
      // datasets with both a group and PI
      if (groupId == null && value !== NO_GROUP) {
        principalInvestigator = null
      }
      this.hasSelectedNoGroup = value === NO_GROUP

      if (value === NO_GROUP) {
        groupId = null
        if (principalInvestigator == null) {
          principalInvestigator = this.lastPrincipalInvestigator || { name: '', email: '' }
        }
      } else if (value === FIND_GROUP) {
        groupId = null
        this.showFindGroupDialog = true
      } else {
        groupId = value
      }

      this.$emit('input', { ...this.value, groupId, principalInvestigator })
    }

    get projectIds() {
      return this.value.projectIds
    }

    set projectIds(projectIds: string[]) {
      if (projectIds.includes(CREATE_PROJECT)) {
        this.showCreateProjectDialog = true
      } else {
        this.$emit('input', {
          ...this.value,
          projectIds: projectIds,
        })
      }
    }

    get groupOptions() {
      const groups = this.submitter != null && this.submitter.groups || []
      const options = groups.map(({ group: { id, name } }) => ({
        value: id,
        label: name,
      }))
      if (this.groupIdIsUnknown && this.unknownGroup != null && this.unknownGroup.id === this.value.groupId) {
        options.push({ value: this.unknownGroup.id, label: this.unknownGroup.name })
      }
      if (this.submitter != null && this.currentUser != null && this.submitter.id === this.currentUser.id) {
        options.push({ value: FIND_GROUP, label: 'Find my group...' })
      }
      options.push({ value: NO_GROUP, label: 'No group (Enter PI instead)' })
      return options
    }

    get projectOptions() {
      const projects = this.submitter != null && this.submitter.projects || []
      const options = projects.map(({ project: { id, name } }) => ({
        value: id,
        label: name,
      }))
      this.unknownProjects.forEach(project => {
        if (!projects.some(p2 => project.id === p2.project.id)) {
          options.push({ value: project.id, label: project.name })
        }
      })
      options.push({ value: CREATE_PROJECT, label: 'Create a new project...' })
      return options
    }

    @Watch('submitter')
    fetchUnknowns() {
      this.fetchGroupIfUnknown()
      this.fetchProjectsIfUnknown()
    }

    @Watch('value.groupId')
    async fetchGroupIfUnknown() {
      // If the dataset is saved with a groupId for a group that the user isn't a member of, or the group
      // was selected through the find dialog, the drop-down list won't have an entry for it, so do an extra query for it.
      const groupId = this.value.groupId
      if (this.groupIdIsUnknown && (!this.unknownGroup || this.unknownGroup.id !== groupId)) {
        const { data } = await this.$apollo.query({
          query: oneGroupQuery,
          variables: { groupId },
        })
        // Double-check the value hasn't changed before setting unknownGroup
        if (this.value.groupId === groupId) {
          this.unknownGroup = data.group
        }
      }
    }

    @Watch('value.projectIds')
    async fetchProjectsIfUnknown() {
      if (this.submitter == null) return // Still loading

      const loadedProjects = this.submitter.projects
      const projectIds = this.value.projectIds
      const unknownProjectIds = projectIds
        .filter(id => loadedProjects == null || !loadedProjects.some(project => project.project.id === id))

      if (unknownProjectIds.length > 0) {
        const promises = unknownProjectIds.map(projectId => this.$apollo.query({
          query: oneProjectQuery,
          variables: { projectId },
        }))
        const datas = await Promise.all(promises)
        if (this.value.projectIds === projectIds) {
          this.unknownProjects = datas.map(({ data }) => data.project)
        }
      }
    }

    @Watch('value.principalInvestigator')
    backupPI() {
      // Save the PI in case user selects a group then changes their mind
      if (this.value.principalInvestigator != null) {
        this.lastPrincipalInvestigator = this.value.principalInvestigator
      }
    }

    handleInputPI(field: 'name' | 'email', value: string) {
      const principalInvestigator = {
        ...this.value.principalInvestigator,
        [field]: value,
      }
      this.$emit('input', { ...this.value, principalInvestigator })
    }

    hideFindGroupDialog() {
      this.showFindGroupDialog = false
    }

    hideCreateProjectDialog() {
      this.showCreateProjectDialog = false
    }

    async handleSelectGroup(group: {id: string, name: string} | null) {
      if (group != null) {
        this.groupId = group.id
        this.unknownGroup = group
      } else {
        const principalInvestigator = this.value.principalInvestigator
          || this.lastPrincipalInvestigator
          || { name: '', email: '' }
        this.$emit('input', { ...this.value, groupId: null, principalInvestigator })
      }
      this.showFindGroupDialog = false
    }

    async handleSelectProject(project: {id: string, name: string}) {
      this.unknownProjects.push(project)
      this.value.projectIds.push(project.id)
      this.showCreateProjectDialog = false
    }

    handleSelectSubmitter(option: SubmitterOption) {
      this.$emit('input', { ...this.value, submitterId: option.id })
    }

    async handleSearchUsers(q: string, cb: FetchSuggestionsCallback) {
      const result = await this.$apollo.query({
        query: gql`query ($query: String!) { allUsers (query: $query) { id name email } }`,
        variables: { query: q },
      })
      const users: {id: string, name: string, email: string}[] = result.data.allUsers
      cb(users.map(u => ({
        id: u.id,
        value: `${u.name} (${u.email})`,
      })))
    }
}
</script>

<style lang="scss">
  //@import './FormSection.scss';
</style>
