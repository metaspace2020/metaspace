<template>
  <div class="reset-password">
    <div v-loading="isTokenValid == null" class="reset-password__body">
      <div v-if="isTokenValid">
        <h1>Reset Password</h1>
        <el-form ref="form" :model="model" :rules="rules" class="reset-password__form">
          <p>Please choose a new password</p>
          <el-form-item prop="password">
            <el-input v-model="model.password" type="password" placeholder="Password" required />
          </el-form-item>
          <el-form-item prop="confirmPassword">
            <el-input
              v-model="model.confirmPassword"
              type="password"
              placeholder="Confirm password"
              required
              @keypress.enter="onSubmit"
            />
          </el-form-item>
          <el-button type="primary" :loading="isSubmitting" @click="onSubmit"> Reset password </el-button>
        </el-form>
      </div>
      <div v-else>
        <h1>Reset Password</h1>
        <p>
          The reset password link you have used is no longer valid. Please
          <router-link to="/account/forgot-password"> start over </router-link>.
        </p>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElForm } from '../../../lib/element-plus'
import { validatePasswordResetToken, resetPassword } from '../../../api/auth'
import reportError from '../../../lib/reportError'
import { refreshLoginStatus } from '../../../api/graphqlClient'

export default defineComponent({
  name: 'ResetPasswordPage',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const form = ref<InstanceType<typeof ElForm>>()
    const isTokenValid = ref<boolean | null>(null)
    const isSubmitting = ref(false)
    const model = reactive({
      password: '',
      confirmPassword: '',
    })

    const rules = {
      password: [
        { required: true, min: 8, message: 'Password must be at least 8 characters' },
        { validator: validatePassword, trigger: 'blur' },
      ],
      confirmPassword: [
        { required: true, min: 8, message: 'Password must be at least 8 characters' },
        { validator: validateConfirmPassword, message: 'Passwords must match', trigger: 'blur' },
      ],
    }

    const token = computed(() => route.query.token as string)
    const email = computed(() => route.query.email as string)

    onMounted(async () => {
      isTokenValid.value =
        Boolean(token.value) && Boolean(email.value) && (await validatePasswordResetToken(token.value, email.value))
    })

    function validatePassword(rule: object, value: string, callback: Function) {
      form.value?.validateField('confirmPassword', () => {})
      callback()
    }

    function validateConfirmPassword(rule: object, value: string, callback: Function) {
      if (value && model.password && value !== model.password) {
        callback(new Error('Passwords must match'))
      } else {
        callback()
      }
    }

    async function onSubmit() {
      await form.value?.validate()
      try {
        isSubmitting.value = true
        await resetPassword(token.value, email.value, model.password)
        await refreshLoginStatus()
        router.push('/')
        // Handle alert logic as needed
      } catch (err) {
        reportError(err)
      } finally {
        isSubmitting.value = false
      }
    }

    return {
      form,
      isTokenValid,
      isSubmitting,
      model,
      rules,
      onSubmit,
    }
  },
})
</script>

<style>
.reset-password {
  padding: 0 20px 20px 20px;
  display: flex;
  justify-content: center;
}
.reset-password__body {
  flex: 0 1 950px;
}
.reset-password__form {
  max-width: 400px;
}
</style>
