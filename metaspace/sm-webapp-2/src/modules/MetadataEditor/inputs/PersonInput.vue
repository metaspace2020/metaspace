<template>
  <el-row>
    <el-col class="subfield" :span="12">
      <el-form-item :class="{ 'is-error': error && error.First_Name }" required>
        <el-input :value="value.First_Name" :required="required" @input="(val) => onInput('First_Name', val)" />
        <div class="subfield-label">First name</div>
        <span v-if="error && error.First_Name" class="error-msg">{{ error && error.First_Name }}</span>
      </el-form-item>
    </el-col>

    <el-col class="subfield" :span="12">
      <el-form-item :class="{ 'is-error': error && error.Surname }" required>
        <el-input :value="value.Surname" :required="required" @input="(val) => onInput('Surname', val)" />
        <div class="subfield-label">Surname</div>
        <span v-if="error && error.Surname" class="error-msg">{{ error && error.Surname }}</span>
      </el-form-item>
    </el-col>

    <el-col class="subfield" :span="24">
      <el-form-item :class="{ 'is-error': error && error.Email }" required>
        <el-input
          :value="value.Email"
          :required="required"
          :disabled="disableEmail"
          placeholder="an email address for contact"
          @input="(val) => onInput('Email', val)"
        />
        <div class="subfield-label">Email</div>
        <span v-if="error && error.Email" class="error-msg">{{ error && error.Email }}</span>
      </el-form-item>
    </el-col>
  </el-row>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Person } from '../formStructure'
import { ElCol, ElRow, ElFormItem, ElInput } from 'element-plus'
export default defineComponent({
  name: 'PersonInput',
  components: {
    ElCol,
    ElRow,
    ElFormItem,
    ElInput,
  },
  props: {
    value: {
      type: Object as any,
      required: true,
    },
    error: {
      type: Object as any,
      default: () => ({}),
    },
    required: {
      type: Boolean,
      default: false,
    },
    fetchSuggestions: {
      type: Function,
      required: true,
    },
    disableEmail: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['input'],
  setup(props, { emit }) {
    const onInput = (fieldName: keyof Person, value: string) => {
      const newValue = {
        ...props.value,
        [fieldName]: value,
      }
      emit('input', newValue)
    }

    return {
      onInput,
    }
  },
})
</script>
<style></style>
