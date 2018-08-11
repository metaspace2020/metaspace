<template>
  <div class="metadata-section">
    <el-dialog
      :visible.sync="findMyGroup"
      :lockScroll="false">
      <h2>Find a group</h2>
      <p>If you are not member of a group, you can request access here and your dataset will be
      automatically added to the group once your access has been approved.</p>
      <el-form >
        <el-form-item label="Your group:">
          <el-row>
            <el-select
              v-model="extraGroup"
              filterable
              remote
              reserve-keyword
              placeholder="Enter group name"
              value-key="id"
              :loading="loading">
              <el-option
                v-for="group in allGroups"
                :key="group.id"
                :label="group.name"
                :value="group.name" />
            </el-select>
          </el-row>
        </el-form-item>
      </el-form>

      <el-row style="margin: 15px 0">
        <el-button
          title="Request access"
          type="primary"
          :loading="isGroupAccessLoading"
          @click="onRequestGroupAccess">Request access
        </el-button>
      </el-row>
      <el-row>
        <p><b>Can't find your group?</b> You can <a>create a group</a> to get your team started,
          or <a @click="addPIsection" style="cursor: pointer">fill in your Principal Investigator</a> instead.</p>
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
                name="Your full name"
                v-model="name"
                placeholder="Enter your full name"
                required
                disabled>
              </form-field>
            </el-col>
            <el-col :span="8">
              <form-field
                v-model="groupNameToSubmit"
                :options="listOfGroups"
                type="select"
                placeholder="Select your group"
                @input="val=>onInput('group', val)"
                name="Group"
                required>
              </form-field>
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
      <el-row  v-if="enablePI" >
        <el-col :span="6">
          <div class="section-description">Principal Investigator</div>
        </el-col>
        <el-col :span="18">
          <el-row :gutter="8">
            <el-form size="medium"
                     label-position="top">
              <el-col :span="8">
                <form-field
                  type="text"
                  name="Full PI name"
                  v-model="namePI"
                  placeholder="Principal investigator full name"
                  required
                />
              </el-col>
              <el-col :span="8">
                <form-field
                  v-model="emailPI"
                  type="text"
                  placeholder="PI address"
                  name="PI Email"
                  required>
                </form-field>
              </el-col>
              <el-col :span="8">
                <el-button plain
                  round
                  type="info"
                  icon="el-icon-minus"
                  @click="removePIsection"
                  style="padding: 4px; transform: translateY(100%)"
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
  import {CurrentUserResult, currentUserQuery, allGroups, requestAccessToGroupMutation} from '../../api/dataManagement';
  import reportError from "../../lib/reportError";

  interface Group {
    id: string;
    name: string;
  }

  @Component({
    components: {
      FormField
    },
    apollo: {
      currentUser: {
        query: currentUserQuery
      },
      allGroups: {
        query: allGroups,
        variables: {
          query: ''
        }
      }
    }
  })

  export default class DataManagementSection extends Vue {
    @Prop({type: Object, required: true})
    value!: MetaspaceOptions;

    currentUser?: CurrentUserResult | null = null;
    name: string = '';
    groupNameToSubmit: string = '';
    groupIdToSubmit: number | null = null;
    findMyGroup: boolean = false;
    allGroups: Group[] | null = null;
    loading: boolean = false;
    extraGroup: string | null = null;
    isGroupAccessLoading: boolean = false;

    enablePI: boolean = false;
    namePI: string = '';
    emailPI: string = '';

    @Watch('currentUser', {deep:true})
    onCurrentUserChanged(this: any) {
      this.name = this.currentUser.name;
      this.groupNameToSubmit = this.currentUser.primaryGroup.group.name;
      //By default groupId for submission is equal to user's primary group
      this.groupIdToSubmit = this.currentUser.primaryGroup.group.id;
    }
    
    //This is to watch extraGroup, a value from the dialog for finding a group
    //This value is then assigned to instance groupNameToSubmit/groupIdToSubmit
    @Watch('extraGroup', {deep: true})
    onChange(this: any): void {
      let group = this.allGroups.find((it: Group) => {
        return it.name === this.extraGroup;
      });
      if (group !== undefined) {
        this.groupNameToSubmit = group.name;
        this.groupIdToSubmit = group.id;
      }
    }

    get userGroupsData(): Group[] {
      if (this.currentUser == null) {
        return [];
      }
      const groupList = this.currentUser.groups.map(it => {
        return it.group
      });
      groupList.push({id: '0', name: this.findGroupMessage});
      groupList.push({id: '-1', name: this.noGroupMessage});
      return groupList
    }

    get findGroupMessage(): string {
      return "Find my group...";
    }

    get noGroupMessage(): string {
      return "No group (Enter PI instead)";
    }

    get listOfGroups(): string[] {
      return this.userGroupsData.map(it => {
        return it.name
      });
    }

    onInput<TKey extends keyof MetaspaceOptions>(field: TKey, val: MetaspaceOptions[TKey]) {
      if (val === this.findGroupMessage) {
        this.enablePI = false;
        this.findMyGroup = true;
      } else if (val === this.noGroupMessage) {
        this.addPIsection();
      } else {
        this.enablePI = false;
      }
      this.$emit('input', {...this.value, [field]: val});
    }

    addPIsection(): void {
      this.findMyGroup = false;
      this.enablePI = true;
      this.groupNameToSubmit = this.noGroupMessage;
      this.groupIdToSubmit = null;
    }

    removePIsection(): void {
      this.enablePI = false;
      this.groupNameToSubmit = '';
    }

    async onRequestGroupAccess(this: any) {
      try {
        this.isGroupAccessLoading = true;
        this.$apollo.mutate({
          mutation: requestAccessToGroupMutation,
          variables: {
            groupId: this.groupIdToSubmit,
            bringDatasets: ''
          }
        });
        this.findMyGroup = false;
        this.$message({
          message: 'Your request was successfully sent!',
          type: 'success'
        })
      } catch(err) {
        reportError(err);
        this.$message({
          message: 'There was an unexpected problem with your request. Please try again.'
          + 'If this problem persists, please contact us at '
          + '<a href="mailto:contact@metaspace2020.eu">contact@metaspace2020.eu</a>',
          dangerouslyUseHTMLString: true,
          type: 'error',
          duration: 0,
          showClose: true
        })
      } finally {
        this.isGroupAccessLoading = false;
      }
    }
  }
</script>

<style lang="scss">
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

  .el-dialog__body {
    padding: 10px 25px;
  }
</style>
