<template>
  <div class="metadata-section">
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
              />
            </el-col>
            <el-col :span="8">
              <form-field
                :value="value.groups"
                :options="groupsData"
                type="selectMulti"
                placeholder="Select your group"
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
    // groupsData: string [] = '';
    // groupsData: string[] = ['test1', 'test2']

    get groupsData(): string[] {
      console.log(this.value)
      if (this.currentUser == null) {
        return [];
      }
      const groupList = this.currentUser.groups.map(it => {
        return it.group.name
      });
      groupList.push('No group...');
      return groupList
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
