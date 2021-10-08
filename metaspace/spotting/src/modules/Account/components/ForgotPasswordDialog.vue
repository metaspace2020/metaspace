<template>
  <el-dialog
    title="Reset password"
    visible
    :lock-scroll="false"
    @close="onClose"
  >
    <div v-if="hasSucceeded">
      <p>Please check your email for further instructions.</p>
    </div>
    <div v-else>
      <el-form
        ref="form"
        :model="model"
        :rules="rules"
      >
        <p>
          Please enter the email address you used to sign up to METASPACE and we will send you an email with a link for resetting your password.
        </p>
        <el-form-item prop="email">
          <el-input
            v-model="model.email"
            placeholder="Email address"
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
      <h1 />
      <p>Has your email address changed? <a href="mailto:contact@metaspace2020.eu">Contact us</a></p>
    </div>
  </el-dialog>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component } from 'vue-property-decorator'
import { Form } from '../../../lib/element-ui'
import InterDialogLink from './InterDialogLink'
import { sendPasswordResetToken } from '../../../api/auth'
import reportError from '../../../lib/reportError'

  interface Model {
    email: string;
  }

  @Component({
    components: {
      InterDialogLink,
    },
  })
export default class ForgotPasswordDialog extends Vue {
    isSubmitting: boolean = false;
    hasSucceeded: boolean = false;
    model: Model = {
      email: '',
    };

    rules = {
      email: [{ required: true, message: 'Email address is required' }],
    };

    async onSubmit() {
      try {
        const form = this.$refs.form as Form
        this.isSubmitting = true
        await form.validate()
        await sendPasswordResetToken(this.model.email)
        this.hasSucceeded = true
      } catch (err) {
        // form.validate() throws false if something is invalid. Detect it so that we don't log "false" as an error
        if (err !== false) {
          reportError(err)
        }
      } finally {
        this.isSubmitting = false
      }
    }

    onClose() {
      this.$store.commit('account/hideDialog', 'forgotPassword')
    }
}
</script>

<style scoped lang="scss">
  .el-dialog__wrapper /deep/ .el-dialog {
    width: 570px;
  }
  .sign-in {
    display: flex;
    flex-direction: row;
    align-items: stretch;
  }
  .left-side {
    flex: 0 1 240px;
  }
  .right-side {
    flex: 0 1 240px;
  }
  .mid {
    flex: 0 0 50px;
    display: flex;
    flex-direction: column;
    align-items: center;

    .divider {
      flex-grow: 1;
      border-left: 1px solid lightgrey;
    }
    .text {
      flex: none;
      line-height: 2em;
    }
  }
  .el-button {
    width: 100%;
  }

  .google-button {
    text-decoration: none;
  }
</style>
