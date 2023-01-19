<template>
  <el-dialog
    title="Sign in"
    visible
    :lock-scroll="false"
    @close="onClose"
  >
    <div class="container">
      <div class="left-side">
        <el-form
          ref="form"
          :model="model"
          :rules="rules"
        >
          <el-form-item
            prop="email"
            :validate-status="isInvalid ? 'error' : undefined"
          >
            <el-input
              v-model="model.email"
              placeholder="Email address"
            />
          </el-form-item>
          <el-form-item
            prop="password"
            :validate-status="isInvalid ? 'error' : undefined"
          >
            <el-input
              v-model="model.password"
              type="password"
              placeholder="Password"
              @keypress.native.enter="onSubmit"
            />
          </el-form-item>
          <vue-slide-up-down :active="isInvalid">
            <p style="margin-top: 0; color: red">
              Incorrect username or password
            </p>
          </vue-slide-up-down>
          <el-button
            type="primary"
            :loading="isSubmitting"
            @click="onSubmit"
          >
            Sign in
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
          <google-button>Sign in with Google</google-button>
        </a>
      </div>
    </div>
    <p>
      <inter-dialog-link dialog="forgotPassword">
        Forgot password?
      </inter-dialog-link>
    </p>
    <p>
      New user? <inter-dialog-link dialog="createAccount">
        Create an account
      </inter-dialog-link>
    </p>
    <p style="margin-bottom: 0">
      Submitted data previously but never set a password? <a
        href="#"
        @click.prevent="togglePreMigrationUserInfo"
      >Click here</a>
    </p>
    <vue-slide-up-down :active="showPreMigrationUserInfo">
      <p style="margin-bottom: 0;">
        We now require that all METASPACE users have an account to upload and manage datasets.
        If you have submitted datasets to METASPACE previously,
        please <inter-dialog-link dialog="createAccount">
          create an account
        </inter-dialog-link> using the same email address
        that you used when submitting the datasets, and you will be reunited with them.
        <a href="mailto:contact@metaspace2020.eu">Contact us</a> if you have lost access to any datasets that you submitted.
      </p>
    </vue-slide-up-down>
  </el-dialog>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Watch } from 'vue-property-decorator'
import VueSlideUpDown from 'vue-slide-up-down'
import { Form } from '../../../lib/element-ui'
import GoogleButton from './GoogleButton.vue'
import InterDialogLink from './InterDialogLink'
import { signInByEmail } from '../../../api/auth'
import { refreshLoginStatus } from '../../../api/graphqlClient'
import reportError from '../../../lib/reportError'
import { setSignInReturnUrl } from '../signInReturnUrl'

  interface Model {
    email: string;
    password: string;
  }

  @Component({
    components: {
      VueSlideUpDown,
      GoogleButton,
      InterDialogLink,
    },
  })
export default class SignInDialog extends Vue {
    isSubmitting: boolean = false;
    isInvalid: boolean = false;
    showPreMigrationUserInfo: boolean = false;
    model: Model = {
      email: '',
      password: '',
    };

    rules = {
      email: [{ required: true, message: 'Email address is required' }],
      password: [{ required: true, message: 'Password is required' }],
    };

    @Watch('model', { deep: true })
    onModelChanged() {
      this.isInvalid = false
    }

    togglePreMigrationUserInfo() {
      this.showPreMigrationUserInfo = !this.showPreMigrationUserInfo
    }

    async onSubmit() {
      const form = this.$refs.form as Form
      await form.validate()
      try {
        const { email, password } = this.model
        this.isSubmitting = true
        const authenticated = await signInByEmail(email, password)
        if (authenticated) {
          await refreshLoginStatus()
          this.$store.commit('account/hideDialog', { dialog: 'signIn', isLoginSuccess: true })
        } else {
          form.clearValidate()
          this.isInvalid = true
        }
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
      this.$store.commit('account/hideDialog', 'signIn')
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
