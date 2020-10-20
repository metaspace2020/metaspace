<template>
  <el-form
    ref="form"
    :model="value"
    :disabled="disabled"
    :rules="rules"
    label-position="top"
    class="leading-6"
    @submit="handleSubmit"
  >
    <div>
      <label>
        <primary-label-text>Title</primary-label-text>
        <el-input
          v-model="value.name"
          class="py-1"
          :max-length="50"
        />
      </label>
    </div>
    <div>
      <label>
        <primary-label-text>Privacy</primary-label-text>
        <secondary-label-text>
          Visibility of the project only, does not apply to included datasets
        </secondary-label-text>
      </label>
      <div class="h-6 flex items-center">
        <el-switch
          v-model="value.isPublic"
          :disabled="isPublished"
          active-text="Public"
          inactive-text="Private"
        />
      </div>
      <p
        v-if="isPublished"
        class="m-0 italic text-sm text-gray-700"
      >
        published projects are always visible
      </p>
    </div>
  </el-form>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Model, Prop } from 'vue-property-decorator'
import { ElForm } from 'element-ui/types/form'

import { PrimaryLabelText, SecondaryLabelText } from '../../components/Form'

  interface Model {
    name: string;
    isPublic: boolean;
  }

  @Component({
    components: {
      PrimaryLabelText,
      SecondaryLabelText,
    },
  })
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
