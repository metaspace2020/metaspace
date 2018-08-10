<template>
  <div class="metadata-section">
    <el-dialog
      :visible.sync="findMyGroup"
      :lockScroll="false">
      <h2>Find a group</h2>
      <p>If you are not member of a group, you can request access here and your dataset will be
      automatically added to the group once your access has been approved.</p>
      <el-form :model="foo">
        <el-form-item label="Your group:">
          <el-row>
            <el-select
              v-model="valueGroup"
              filterable
              remote
              reserve-keyword
              placeholder="Enter group name"
              value-key="id"
              size="mini"
              :rules="{required: true, message: 'Please select your group or add PI instead'}"
              :loading="loading">
              <el-option
                v-for="group in allGroups"
                @click="val => showVal(val)"
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
          or <a @click="addPI" style="cursor: pointer">fill in your Principal Investigator</a> instead.</p>
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
                disabled
              />
            </el-col>
            <el-col :span="8">
              <form-field
                v-model="groupNameToSubmit"
                :options="userGroupsData"
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
                <el-button
                  round
                  type="primary"
                  icon="el-icon-minus"
                  @click="removePIsection"
                  style="padding: 5px; transform: translateY(90%)"
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
  import { delay } from '../../util'

  interface Group {
    id: string;
    name: string;
    label: string
  }

  @Component({
    components: {
      FormField
    },
    apollo: {
      currentUser: {
        query: currentUserQuery
      },
      // allGroups: {
      //   query: allGroups,
      //   variables: {
      //     query: ''
      //   }
      // }
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
    allGroups: Group[];
    loading: boolean = false;
    valueGroup: Group | null = null;
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

    @Watch('valueGroup', {deep: true})
    onValChange(): void {
      let group = this.allGroups.find(it => {
        return it.name === this.valueGroup;
      });
      this.groupIdToSubmit = group.id;
    }

    //Mocked data
    userGroupsData: string[] = ['GroupA', 'GroupB', 'GroupC', 'Find my group...', 'No group (Use a Principal Investigator instead)'];
    get allGroups(): Group[] {
      return [{
        id: '1',
        name: 'groupG'
        },
        {
          id: '23',
          name: 'groupF'
        }]
    }

    //
    // get userGroupsData(): string[] {
    //   console.log(this.allGroups)
    //
    //   if (this.currentUser == null) {
    //     return [];
    //   }
    //   const groupList = this.currentUser.groups.map(it => {
    //     return it.group.name
    //   });
    //   groupList.push('Find my group...');
    //   groupList.push('No group (Use a Principal Investigator instead)');
    //   return groupList
    // }

    onInput<TKey extends keyof MetaspaceOptions>(field: TKey, val: MetaspaceOptions[TKey]) {
      if (val === 'Find my group...') {
        this.findMyGroup = true;
      }
      if (val === 'No group (Use a Principal Investigator instead)') {
        this.addPI();
      }
      else {
        this.removePIsection()
      }
      this.$emit('input', {...this.value, [field]: val});
    }

    async onRequestGroupAccess(this: any): void {
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

    addPI(): void {
      this.findMyGroup = false;
      this.enablePI = true;
    }

    removePIsection(): void {
      this.enablePI = false;
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
