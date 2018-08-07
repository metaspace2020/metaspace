<template>
  <div class="metadata-section">
    <el-dialog
      :visible.sync="findMyGroup"
      :lockScroll="false">
      <h2>Find a group</h2>
      <p>If you are not member of a group, you can request access here and your dataset will be
      automatically added to the group once your access has been approved.</p>
      <el-select
        v-model="findGroup"
        multiple
        filterable
        remote
        reserve-keyword
        placeholder="Enter group name"
        :remote-method="remoteMethod"
        :loading="loading">

      </el-select>


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
                name="Full name"
                v-model="name"
                placeholder="Enter your full name"
                required
                disabled
              />
            </el-col>
            <el-col :span="8">
              <form-field
                v-model="groupNameToSubmit"
                :options="groupsData"
                type="select"
                placeholder="Select your group"
                @input="val=>onInput('group', val)"
                name="Group"
                required>
              </form-field>
            </el-col>
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
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import FormField from './FormField.vue';
  import { MetaspaceOptions } from './formStructure';
  import { CurrentUserResult, currentUserQuery } from '../../api/mockedProfileData';
  import { pick } from 'lodash-es';

  @Component({
    components: {
      FormField
    },
    apollo: {
      currentUser: {
        query: currentUserQuery,
        result(data) {
          this.name = data.data.currentUser.name;
          this.groupNameToSubmit = data.data.currentUser.primaryGroup.group.name;
          this.groupIdToSubmit = data.data.currentUser.primaryGroup.group.id;
        }
      }
    }
  })

  export default class DataManagementSection extends Vue {
    @Prop({type: Object, required: true})
    value!: MetaspaceOptions;

    currentUser?: CurrentUserResult | null = null;
    name: string | null=null;
    email: string | null=null;
    groupNameToSubmit: string | null=null;
    findMyGroup: boolean = false;
    allGroups: string[];

    get groupsData(): string[] {
      if (this.currentUser == null) {
        return [];
      }
      const groupList = this.currentUser.groups.map(it => {
        return it.group.name
      });
      groupList.push('Find my group...');
      groupList.push('No group(Use a Principal Investigator instead)');
      return groupList
    }

    onInput<TKey extends keyof MetaspaceOptions>(field: TKey, val: MetaspaceOptions[TKey]) {
      console.log(val)
      if (val=='Find my group...') {
        this.findMyGroup = true;
        // this.$apollo.queries.
      }
      // this.$emit('input', {...this.value, [field]: val});
    }
  }
</script>

<style lang="scss">
  .metadata-section {
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
</style>
