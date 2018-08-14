<template>
  <div class="metadata-section">
    <el-dialog
      custom-class="find-group-dialog"
      :visible.sync="showFindGroupDialog"
      :lockScroll="false">
      <h2>Find a group</h2>
      <p>If you are not member of a group, you can request access here and your dataset will be
      automatically added to the group once your access has been approved.</p>
      <el-form >
        <el-form-item label="Your group:">
          <el-row>
            <el-select
              v-model="groupSearchSelectedId"
              filterable
              remote
              :remote-method="handleGroupSearch"
              placeholder="Enter group name"
              :loading="groupSearchLoading !== 0">
              <el-option
                v-for="group in groupSearchResults"
                :key="group.id"
                :label="group.name"
                :value="group.id" />
            </el-select>
          </el-row>
        </el-form-item>
      </el-form>

      <el-row style="margin: 15px 0">
        <el-button @click="onCancelFindGroupDialog">Cancel</el-button>
        <el-button
          type="primary"
          :disabled="groupSearchSelectedId == null"
          :loading="isGroupAccessLoading"
          @click="onRequestGroupAccess">Request access
        </el-button>
      </el-row>
      <el-row>
        <p>
          <b>Can't find your group?</b> <a href="mailto:contact@metaspace2020.eu">Contact us</a> to get your team started,
          or <a href="#" @click.prevent="handleSelectNoGroup" style="cursor: pointer">fill in your Principal Investigator</a> instead.
        </p>
      </el-row>
    </el-dialog>
    <el-row>
      <el-col :span="6">
        <div class="section-description">Data management</div>
      </el-col>
      <el-col :span="18">
        <el-row :gutter="8">
          <el-form size="medium"
                   label-position="top">
            <el-col :span="8">
              <form-field
                type="text"
                name="Submitter name"
                :value="submitter != null ? submitter.name : ''"
                required
                disabled />
            </el-col>
            <el-col :span="8">
              <form-field
                v-model="groupId"
                :error="error && error.groupId"
                :options="groupOptions"
                type="select"
                placeholder="Select your group"
                name="Group"
                required />
            </el-col>
            <!--Uncomment when projects are introduced-->
            <!--<el-col :span="8">-->
            <!--<form-field-->
            <!--type="selectMulti"-->
            <!--name="Project"-->
            <!--required-->
            <!--/>-->
            <!--</el-col>-->
          </el-form>
        </el-row>
      </el-col>
    </el-row>
    <el-collapse-transition>
      <el-row v-if="showPI" >
        <el-col :span="6">
          <div class="section-description">Principal Investigator</div>
        </el-col>
        <el-col :span="18">
          <el-row :gutter="8">
            <el-form size="medium" label-position="top">
              <el-col :span="8">
                <form-field
                  type="text"
                  name="Full name"
                  :value="value.principalInvestigator ? value.principalInvestigator.name : ''"
                  @input="value => handleInputPI('name', value)"
                  :error="error && error.principalInvestigator && error.principalInvestigator.name"
                  required
                />
              </el-col>
              <el-col :span="8">
                <form-field
                  type="text"
                  name="Email address"
                  :value="value.principalInvestigator ? value.principalInvestigator.email : ''"
                  @input="value => handleInputPI('email', value)"
                  :error="error && error.principalInvestigator && error.principalInvestigator.email"
                  required
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
  import Vue from 'vue';
  import { Component, Prop, Watch } from 'vue-property-decorator';
  import FormField from './FormField.vue';
  import { MetaspaceOptions } from './formStructure';
  import {
    allGroupsQuery,
    requestAccessToGroupMutation,
    GroupListItem,
    oneGroupQuery,
  } from '../../api/dataManagement';
  import reportError from "../../lib/reportError";
  import { DatasetSubmitterFragment } from '../../api/user';

  const FIND_GROUP = 'FIND_GROUP';
  const NO_GROUP = 'NO_GROUP';

  @Component<DataManagementSection>({
    components: {
      FormField
    },
    apollo: {
      groupSearchResults: {
        query: allGroupsQuery,
        loadingKey: 'groupSearchLoading',
        variables() {
          return {
            query: this.groupSearchQuery
          };
        },
        skip() {
          return this.groupSearchQuery === '';
        },
        update: data => data.allGroups
      },
      unknownGroup: {
        // If the dataset is saved with a groupId for a group that the user isn't a member of, do an extra query for it.
        query: oneGroupQuery,
        variables() {
          return {
            groupId: this.groupId
          }
        },
        skip() {
          return !this.groupIdIsUnknown;
        },
        update(data){
          return {
            ...data.group,
            id: this.groupId, //FIXME: Needed for testing because mocked server returns random IDs
          }
        }
      }
    }
  })

  export default class DataManagementSection extends Vue {
    @Prop({type: Object, required: true})
    value!: MetaspaceOptions;
    @Prop(Object)
    submitter!: DatasetSubmitterFragment | null;
    @Prop({type: Object })
    error?: Record<string, any>;

    groupSearchQuery: string = '';
    groupSearchResults: GroupListItem[] | null = null;
    groupSearchLoading = 0;
    groupSearchSelectedId: string | null = null;
    unknownGroup: GroupListItem | null = null;
    showFindGroupDialog: boolean = false;
    loading: boolean = false;
    isGroupAccessLoading: boolean = false;
    hasSelectedNoGroup: boolean = false;
    lastPrincipalInvestigator: MetaspaceOptions['principalInvestigator'] = null;

    get showPI() {
      return this.hasSelectedNoGroup || this.value.principalInvestigator != null;
    }

    get groupIdIsUnknown() {
      return this.value.groupId != null
        && this.submitter != null
        && this.submitter.groups != null
        && !this.submitter.groups.some(group => group.group.id === this.value.groupId);
    }

    get groupId() {
      if (this.value.groupId != null) {
        return this.value.groupId;
      } else if (this.showPI) {
        return NO_GROUP;
      } else {
        return null;
      }
    }
    set groupId(value: string | null) {
      let groupId = this.value.groupId;
      let principalInvestigator = this.value.principalInvestigator;

      // Remove PI only if changing away from the "No group" option, to prevent data loss in case we somehow get
      // datasets with both a group and PI
      if (groupId == null && value !== NO_GROUP) {
        principalInvestigator = null;
      }
      this.hasSelectedNoGroup = value === NO_GROUP;

      if (value === NO_GROUP) {
        groupId = null;
        if (principalInvestigator == null) {
          principalInvestigator = this.lastPrincipalInvestigator || {name: '', email: ''};
        }
      } else if (value === FIND_GROUP) {
        groupId = null;
        this.showFindGroupDialog = true;
      } else {
        groupId = value;
      }

      this.$emit('input', {...this.value, groupId, principalInvestigator})
    }

    get groupOptions() {
      if (this.submitter == null || this.submitter.groups == null) {
        return [];
      }
      const options = this.submitter.groups.map(({group: {id, name}}) => ({
        value: id,
        label: name,
      }));
      if (this.groupIdIsUnknown && this.unknownGroup != null) {
        options.push({value: this.unknownGroup.id, label: this.unknownGroup.name });
      }
      options.push({value: FIND_GROUP, label: "Find my group..."});
      options.push({value: NO_GROUP, label: "No group (Enter PI instead)"});
      return options;
    }

    @Watch('value.principalInvestigator')
    backupPI() {
      // Save the PI in case user selects a group then changes their mind
      if (this.value.principalInvestigator != null) {
        this.lastPrincipalInvestigator = this.value.principalInvestigator;
      }
    }

    handleSelectNoGroup() {
      const principalInvestigator = this.value.principalInvestigator || this.lastPrincipalInvestigator || {name: '', email: ''};

      this.$emit('input', {...this.value, groupId: null, principalInvestigator});
      this.showFindGroupDialog = false;
    }

    handleInputPI(field: 'name' | 'email', value: string) {
      const principalInvestigator = {
        ...this.value.principalInvestigator,
        [field]: value,
      };
      this.$emit('input', {...this.value, principalInvestigator});
    }

    handleGroupSearch(query: string) {
      this.groupSearchQuery = query;
    }

    onCancelFindGroupDialog() {
      this.showFindGroupDialog = false;
    }

    async onRequestGroupAccess() {
      try {
        this.isGroupAccessLoading = true;
        await this.$apollo.mutate({
          mutation: requestAccessToGroupMutation,
          variables: {
            groupId: this.groupSearchSelectedId,
            bringDatasets: []
          }
        });

        this.groupId = this.groupSearchSelectedId;
        await this.$apollo.queries.unknownGroup.refresh(); // wait for new group to load

        this.showFindGroupDialog = false;
        this.$message({
          message: 'Your request was successfully sent!',
          type: 'success'
        });
      } catch(err) {
        reportError(err);
      } finally {
        this.isGroupAccessLoading = false;
      }
    }
  }
</script>

<style scoped lang="scss">
  .metadata-section {
    margin-top: 10px;
    display: block;
    max-width: 950px;
  }

  .section-description {
    font-family: Helvetica, sans-serif;
    font-weight: bold;
    margin: 30px 0 0 10px;
    display: block;
    position: relative;
    top: 50%;
    transform: translateY(-50%);
  }

  /deep/ .find-group-dialog {
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
