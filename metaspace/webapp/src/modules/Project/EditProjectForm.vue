<template>
  <el-form
    ref="formRef"
    :model="formValue"
    :disabled="disabled"
    :rules="rules"
    label-position="top"
    class="leading-6"
    @submit="handleSubmit"
  >
    <div>
      <label>
        <primary-label-text>Title</primary-label-text>
        <el-form-item prop="name">
          <el-input v-model="formValue.name" class="py-1" :max-length="50" :min-length="2" validate-event />
        </el-form-item>
      </label>
      <el-input class="hidden" />
    </div>
    <div>
      <label>
        <primary-label-text>Privacy</primary-label-text>
        <secondary-label-text>
          Visibility of the project only, does not apply to included datasets
        </secondary-label-text>
      </label>
      <div class="h-10 flex items-center">
        <el-switch v-model="formValue.isPublic" :disabled="isPublished" active-text="Public" inactive-text="Private" />
      </div>
      <p v-if="isPublished" class="m-0 italic text-sm text-gray-700">published projects are always visible</p>
    </div>
  </el-form>
</template>

<script lang="ts">
import { defineComponent, ref, reactive, watch } from 'vue'
import { ElForm, ElInput, ElSwitch, ElFormItem } from '../../lib/element-plus'

import { PrimaryLabelText, SecondaryLabelText } from '../../components/Form'

interface Model {
  name: string
  isPublic: boolean
}

export default defineComponent({
  name: 'EditProjectForm',
  components: {
    PrimaryLabelText,
    SecondaryLabelText,
    ElForm,
    ElInput,
    ElSwitch,
    ElFormItem,
  },
  props: {
    modelValue: {
      type: Object as () => Model,
      required: true,
    },
    disabled: Boolean,
    isPublished: Boolean,
  },
  setup(props, { emit }) {
    const formRef = ref<InstanceType<typeof ElForm>>()
    const formValue = reactive({ ...props.modelValue })

    watch(
      formValue,
      (newVal) => {
        emit('update:modelValue', newVal)
      },
      { deep: true }
    )

    watch(
      () => props.modelValue,
      (newVal) => {
        Object.assign(formValue, newVal)
      },
      { deep: true }
    )

    const rules = {
      name: [
        { required: true, message: 'Name is required', trigger: 'manual' },
        { min: 2, max: 50, message: 'Length should be 2 to 50', trigger: 'change' },
      ],
    }

    const validate = (): Promise<boolean> => {
      return formRef.value.validate()
    }
    const handleSubmit = (e: Event) => {
      e.preventDefault()
    }

    return {
      formRef,
      formValue,
      rules,
      handleSubmit,
      validate,
    }
  },
})
</script>

<style scoped>
.el-input {
  @apply py-1;
}

.sm-form-error .el-input__inner,
input:invalid {
  @apply border-danger;
}
</style>
