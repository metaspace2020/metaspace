<template>
  <el-form
    ref="form"
    :model="model"
    :disabled="disabled"
    :rules="rules"
    label-position="top"
  >
    <div>
      <el-form-item
        label="Full name"
        prop="name"
        class="name"
      >
        <el-input
          v-model="model.name"
          :max-length="50"
        />
      </el-form-item>
      <el-form-item
        label="Short name"
        prop="shortName"
        class="shortName"
      >
        <span slot="label">
          Short name
          <el-popover
            trigger="hover"
            placement="right"
          >
            <i
              slot="reference"
              class="el-icon-question metadata-help-icon"
            />
            <p>The short name will be shown whenever space is limited.</p>
          </el-popover>
        </span>
        <el-input
          v-model="model.shortName"
          :max-length="shortNameMaxLength"
        />
      </el-form-item>
    </div>
    <div v-if="showGroupAdmin">
      <el-form-item
        label="Group admin"
        prop="groupAdminEmail"
      >
        <el-input
          v-model="model.groupAdminEmail"
          placeholder="Email address"
        />
      </el-form-item>
    </div>
  </el-form>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import emailRegex from '../../lib/emailRegex'
import { ElForm } from 'element-ui/types/form'

  interface Model {
    name: string;
    shortName: string;
    groupAdminEmail?: string;
  }

  @Component
export default class EditGroupForm extends Vue {
    @Prop({ type: Object, required: true })
    model!: Model;

    @Prop({ type: Boolean, default: false })
    disabled!: Boolean;

    @Prop({ type: Boolean, default: false })
    showGroupAdmin!: Boolean;

    shortNameMaxLength = 20;

    rules = {
      name: [{ type: 'string', required: true, min: 2, message: 'Full name is required', trigger: 'manual' }],
      shortName: [{ type: 'string', required: true, min: 2, message: 'Short name is required', trigger: 'manual' }],
      groupAdminEmail: [
        {
          type: 'string',
          pattern: emailRegex,
          required: true,
          message: 'Group admin must be a valid email address',
          trigger: 'manual',
        },
      ],
    };

    async validate(): Promise<boolean> {
      return (this.$refs.form as ElForm).validate()
    }
}

</script>
<style scoped lang="scss">
  .name {
    display: inline-block;
    width: 400px;
  }

  .shortName {
    display: inline-block;
    width: 150px;
    margin-left: 20px;
  }
</style>
