<template>
  <el-form
    ref="form"
    :model="value"
    :disabled="disabled"
    :rules="rules"
    label-position="top"
    @submit="handleSubmit"
  >
    <div>
      <label class="leading-6">
        <span class="font-medium">Title</span>
        <el-input
          v-model="value.name"
          class="py-1"
          :max-length="50"
        />
      </label>
    </div>
    <el-form-item
      prop="isPublic"
      class="my-3"
    >
      <el-checkbox
        v-model="value.isPublic"
        :disabled="isPublished"
      >
        {{ isPublished ?
          'Published projects must be visible' :
          'Allow other users to see this project' }}
      </el-checkbox>
    </el-form-item>
  </el-form>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Model, Prop } from 'vue-property-decorator'
import { ElForm } from 'element-ui/types/form'

  interface Model {
    name: string;
    isPublic: boolean;
  }

  @Component
export default class EditProjectForm extends Vue {
    @Model('input', { type: Object, required: true })
    value!: Model;

    @Prop({ type: Boolean, default: false })
    disabled!: Boolean;

    @Prop({ type: Boolean, default: false })
    isPublished!: Boolean;

    rules = {
      name: [{ type: 'string', required: true, min: 2, message: 'Name is required', trigger: 'manual' }],
    };

    async validate(): Promise<boolean> {
      return (this.$refs.form as ElForm).validate()
    }

    handleSubmit(e: Event) {
      e.preventDefault()
    }
}

</script>
