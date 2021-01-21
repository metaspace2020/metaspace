<template>
  <el-dialog
    :title="hasSucceeded ? 'Welcome to METASPACE!' : 'Create an account'"
    visible
    :lock-scroll="false"
    :close-on-click-modal="!hasSucceeded"
    @close="onClose"
  >
    <div v-if="hasSucceeded">
      <p>Please click the link in the email we sent you to finish setting up your account.</p>
    </div>
    <div v-else>
      <div class="container">
        <div class="left-side">
          <el-form
            ref="form"
            :model="model"
            :rules="rules"
          >
            <el-row>
              <el-col :span="11">
                <el-form-item prop="firstName">
                  <el-input
                    v-model="model.firstName"
                    type="text"
                    placeholder="First name"
                    required
                  />
                </el-form-item>
              </el-col>
              <el-col :span="2">
                &ensp;<!-- el-cols collapse if empty - use a space to prevent this -->
              </el-col>
              <el-col :span="11">
                <el-form-item prop="lastName">
                  <el-input
                    v-model="model.lastName"
                    type="text"
                    placeholder="Last name"
                    required
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item prop="email">
              <el-input
                v-model="model.email"
                type="text"
                placeholder="Email address"
                required
              />
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="model.password"
                type="password"
                placeholder="Password"
                required
                @keypress.native.enter="onSubmit"
              />
            </el-form-item>
            <el-button
              type="primary"
              :loading="isSubmitting"
              @click="onSubmit"
            >
              Create account
            </el-button>
          </el-form>
        </div>
        <div class="mid">
          <div class="divider" />
          <div class="text">
            or
          </div>
          <div class="divider" />
        </div>
        <div class="right-side">
          <a
            class="google-button"
            href="/api_auth/google"
            @click="setSignInReturnUrl"
          >
            <google-button>Sign up with Google</google-button>
          </a>
          <ul style="padding: 0 20px;">
            <li>Quick sign in with no password</li>
            <li>We only see your name and email address</li>
          </ul>
        </div>
      </div>
      <p style="margin-bottom: 0">
        Already registered? <inter-dialog-link dialog="signIn">
          Sign in
        </inter-dialog-link>
      </p>
    </div>
  </el-dialog>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component } from 'vue-property-decorator'
import { Form } from '../../../lib/element-ui'
import GoogleButton from './GoogleButton.vue'
import InterDialogLink from './InterDialogLink'
import { createAccountByEmail } from '../../../api/auth'
import reportError from '../../../lib/reportError'
import emailRegex from '../../../lib/emailRegex'
import { setSignInReturnUrl } from '../signInReturnUrl'

  interface Model {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }

  @Component({
    components: {
      GoogleButton,
      InterDialogLink,
    },
  })
export default class CreateAccountDialog extends Vue {
    isSubmitting: boolean = false;
    hasSucceeded: boolean = false;
    model: Model = {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    };

    rules = {
      firstName: [{ required: true, min: 2, max: 50, message: 'First name is required' }],
      lastName: [{ required: true, min: 2, max: 50, message: 'Last name is required' }],
      email: [
        { required: true, message: 'Email address is required' },
        { pattern: emailRegex, message: 'Must be a valid email address' },
      ],
      password: [
        { required: true, min: 8, message: 'Password must be at least 8 characters' },
      ],
    };

    async onSubmit() {
      try {
        await (this.$refs.form as Form).validate()
      } catch (err) {
        return
      }
      const { email, password, firstName, lastName } = this.model
      this.isSubmitting = true
      try {
        await createAccountByEmail(email, password, `${firstName} ${lastName}`)
        this.hasSucceeded = true
      } catch (err) {
        reportError(err)
      } finally {
        this.isSubmitting = false
      }
    }

    setSignInReturnUrl() {
      setSignInReturnUrl(this.$route)
    }

    onClose() {
      this.$store.commit('account/hideDialog', 'createAccount')
    }
}
</script>

<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/mixins/mixins";

  .el-dialog__wrapper /deep/ .el-dialog {
    width: 400px;
  }

  .container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .left-side {
    flex: 0 1 auto;
  }

  .right-side {
    flex: 0 1 auto;
  }

  .mid {
    flex: 0 0 50px;
    display: flex;
    flex-direction: row;
    align-items: center;

    .divider {
      flex-grow: 1;
      border-top: 1px solid lightgrey;
    }
    .text {
      flex: none;
      padding: 0.5em;
    }
  }

  @include res('sm') {
    .el-dialog__wrapper /deep/ .el-dialog {
      width: 690px;
    }
    .container {
      flex-direction: row;
    }
    .left-side {
      width: 360px;
    }
    .right-side {
      width: 240px;
    }
    .mid {
      flex-direction: column;
      .divider {
        border-top: none;
        border-left: 1px solid lightgrey;
      }
    }
  }

  .el-button {
    width: 100%;
  }

  .google-button {
    text-decoration: none;
  }
</style>
