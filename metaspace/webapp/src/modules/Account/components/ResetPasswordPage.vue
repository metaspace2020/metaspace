<template>
  <div class="reset-password">
    <div
      v-loading="isTokenValid == null"
      class="reset-password__body"
    >
      <div v-if="isTokenValid">
        <h1>Reset Password</h1>
        <el-form
          ref="form"
          :model="model"
          :rules="rules"
          class="reset-password__form"
        >
          <p>
            Please choose a new password
          </p>
          <el-form-item prop="password">
            <el-input
              v-model="model.password"
              type="password"
              placeholder="Password"
              required
            />
          </el-form-item>
          <el-form-item prop="confirmPassword">
            <el-input
              v-model="model.confirmPassword"
              type="password"
              placeholder="Confirm password"
              required
              @keypress.native.enter="onSubmit"
            />
          </el-form-item>
          <el-button
            type="primary"
            :loading="isSubmitting"
            @click="onSubmit"
          >
            Reset password
          </el-button>
        </el-form>
      </div>
      <div v-else>
        <h1>Reset Password</h1>
        <p>
          The reset password link you have used is no longer valid.
          Please <router-link to="/account/forgot-password">
            start over
          </router-link>.
        </p>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component } from 'vue-property-decorator'
import { Form } from '../../../lib/element-ui'
import { validatePasswordResetToken, resetPassword } from '../../../api/auth'
import reportError from '../../../lib/reportError'
import { refreshLoginStatus } from '../../../api/graphqlClient'

  interface Model {
    password: string;
    confirmPassword: string;
  }

  @Component
export default class ResetPasswordPage extends Vue {
    isTokenValid: boolean | null = null;
    isSubmitting: boolean = false;
    model: Model = {
      password: '',
      confirmPassword: '',
    };

    rules = {
      password: [
        { required: true, min: 8, message: 'Password must be at least 8 characters' },
        { validator: this.validatePassword, trigger: 'blur' },
      ],
      confirmPassword: [
        { required: true, min: 8, message: 'Password must be at least 8 characters' },
        { validator: this.validateConfirmPassword, message: 'Passwords must match', trigger: 'blur' },
      ],
    };

    get token() {
      return this.$route.query.token
    }

    get email() {
      return this.$route.query.email
    }

    async created() {
      this.isTokenValid = Boolean(this.token) && Boolean(this.email)
        && await validatePasswordResetToken(this.token, this.email)
    }

    validatePassword(rule: object, value: string, callback: Function) {
      (this.$refs.form as Form).validateField('confirmPassword', () => {})
      callback()
    }

    validateConfirmPassword(rule: object, value: string, callback: Function) {
      if (value && this.model.password && value !== this.model.password) {
        callback(new Error('Passwords must match'))
      } else {
        callback()
      }
    }

    async onSubmit() {
      await (this.$refs.form as Form).validate()
      try {
        this.isSubmitting = true
        await resetPassword(this.token, this.email, this.model.password)
        await refreshLoginStatus()
        this.$router.push('/')
        this.$alert('Your password has been successfully reset.', 'Password reset', { type: 'success' })
          .catch(() => { /* Ignore exception raised when alert is closed */ })
      } catch (err) {
        reportError(err)
      } finally {
        this.isSubmitting = false
      }
    }

    onClose() {
      this.$store.commit('account/hideDialog', 'signIn')
    }
}
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
