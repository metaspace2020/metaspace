<template>
  <el-form ref="form" :model="model" :disabled="disabled" :rules="rules" label-position="top">
    <div>
      <el-form-item label="Name" prop="name" class="name">
        <el-input v-model="model.name" :maxLength="50" />
      </el-form-item>
      <el-form-item prop="isPublic" class="isPublic">
        <el-checkbox v-model="model.isPublic">Allow other users to see this project</el-checkbox>
      </el-form-item>
    </div>
  </el-form>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import { ElForm } from 'element-ui/types/form';

  interface Model {
    name: string;
  }

  @Component
  export default class EditProjectForm extends Vue {
    @Prop({type: Object, required: true})
    model!: Model;
    @Prop({type: Boolean, default: false})
    disabled!: Boolean;

    rules = {
      name: [{type: 'string', required: true, min: 2, message: 'Name is required', trigger: 'manual'}],
    };

    async validate(): Promise<boolean> {
      return await (this.$refs.form as ElForm).validate();
    }
  }

</script>
<style scoped lang="scss">
  .name {
    width: 400px;
  }

  .isPublic {
    margin-left: 10px;
  }
</style>
