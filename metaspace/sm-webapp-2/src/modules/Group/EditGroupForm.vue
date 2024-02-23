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
      <el-form-item label="Full name" prop="name" class="name">
        <el-input v-model="formValue.name" :max-length="50" />
      </el-form-item>
      <el-form-item label="Short name" prop="shortName" class="shortName">
        <template v-slot:label>
          <span>
            Short name
            <el-popover trigger="hover" placement="right">
              <template #reference>
                <el-icon class="metadata-help-icon"><QuestionFilled /></el-icon>
              </template>
              <p>The short name will be shown whenever space is limited.</p>
            </el-popover>
          </span>
        </template>
        <el-input v-model="formValue.shortName" :max-length="shortNameMaxLength" />
      </el-form-item>
    </div>
    <div v-if="showGroupAdmin">
      <el-form-item label="Group admin" prop="groupAdminEmail">
        <el-input v-model="formValue.groupAdminEmail" placeholder="Email address" />
      </el-form-item>
    </div>
  </el-form>
</template>

<script lang="ts">
import { defineComponent, ref, reactive, PropType, watch } from 'vue'
import { ElForm, ElFormItem, ElInput, ElPopover, ElIcon } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import emailRegex from '../../lib/emailRegex'

interface Model {
  name: string
  shortName: string
  groupAdminEmail?: string
}

export default defineComponent({
  components: {
    ElForm,
    ElFormItem,
    ElInput,
    ElPopover,
    ElIcon,
    QuestionFilled,
  },
  props: {
    modelValue: { type: Object as PropType<Model>, required: true },
    disabled: { type: Boolean, default: false },
    showGroupAdmin: { type: Boolean, default: false },
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

    const shortNameMaxLength = 20

    const rules = reactive({
      name: [
        {
          type: 'string',
          required: true,
          min: 2,
          message: 'Full name is required',
          trigger: 'manual',
        },
      ],
      shortName: [
        {
          type: 'string',
          required: true,
          min: 2,
          message: 'Short name is required',
          trigger: 'manual',
        },
      ],
      groupAdminEmail: [
        {
          type: 'string',
          pattern: emailRegex,
          required: true,
          message: 'Group admin must be a valid email address',
          trigger: 'manual',
        },
      ],
    })

    const validate = (): Promise<boolean> => {
      return formRef.value.validate()
    }

    const handleSubmit = (e: Event) => {
      e.preventDefault()
    }

    return {
      formRef,
      shortNameMaxLength,
      rules,
      validate,
      formValue,
      handleSubmit,
    }
  },
})
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
