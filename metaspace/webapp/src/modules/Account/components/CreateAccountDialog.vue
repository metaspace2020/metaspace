<template>
  <el-dialog
    class="max-w-2xl min-w-min"
    :title="hasSucceeded ? 'Welcome to METASPACE!' : 'Create an account'"
    v-model="model.dialogVisible"
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
          <el-form ref="form" :model="model" :rules="rules">
            <el-row>
              <el-col :span="11">
                <el-form-item prop="firstName">
                  <el-input v-model="model.firstName" type="text" placeholder="First name" required />
                </el-form-item>
              </el-col>
              <el-col :span="2"> &ensp;<!-- el-cols collapse if empty - use a space to prevent this --> </el-col>
              <el-col :span="11">
                <el-form-item prop="lastName">
                  <el-input v-model="model.lastName" type="text" placeholder="Last name" required />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item prop="email">
              <el-input v-model="model.email" type="text" placeholder="Email address" required />
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="model.password"
                type="password"
                placeholder="Password"
                required
                @keypress.enter="onSubmit"
              />
            </el-form-item>
            <!-- Add the Checkbox reCAPTCHA -->
            <RecaptchaV2 class="flex justify-center justify-items-center p-2" @load-callback="handleLoadCallback" />
            <el-button data-testid="submit-btn" type="primary" :loading="isSubmitting" @click="onSubmit">
              Create account
            </el-button>
          </el-form>
        </div>
        <div class="mid">
          <div class="divider" />
          <div class="text">or</div>
          <div class="divider" />
        </div>
        <div class="right-side">
          <a class="google-button" href="/api_auth/google" @click="setReturnUrl">
            <google-button>Sign up with Google</google-button>
          </a>
          <ul style="padding: 0 20px">
            <li>Quick sign in with no password</li>
            <li>We only see your name and email address</li>
          </ul>
        </div>
      </div>
      <p style="margin-bottom: 0">
        Already registered? <inter-dialog-link dialog="signIn"> Sign in </inter-dialog-link>
      </p>
    </div>
  </el-dialog>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { FormInstance, ElNotification } from 'element-plus'
import GoogleButton from './GoogleButton.vue'
import InterDialogLink from './InterDialogLink'
import { createAccountByEmail } from '../../../api/auth'
import reportError from '../../../lib/reportError'
import emailRegex from '../../../lib/emailRegex'
import { setSignInReturnUrl } from '../signInReturnUrl'
import { useStore } from 'vuex'
import { useRoute } from 'vue-router'
import { RecaptchaV2 } from 'vue3-recaptcha-v2'

export default defineComponent({
  components: {
    GoogleButton,
    InterDialogLink,
    RecaptchaV2,
  },
  setup() {
    const store = useStore()
    const route = useRoute()
    const isSubmitting = ref(false)
    const hasSucceeded = ref(false)
    const model = ref({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      dialogVisible: true,
    })
    // @ts-ignore
    const recaptchaToken = ref(process.env.NODE_ENV === 'test' ? 'fake-recaptcha-token' : '')

    const rules = {
      firstName: [{ required: true, min: 2, max: 50, message: 'First name is required' }],
      lastName: [{ required: true, min: 2, max: 50, message: 'Last name is required' }],
      email: [
        { required: true, message: 'Email address is required' },
        { pattern: emailRegex, message: 'Must be a valid email address' },
      ],
      password: [{ required: true, min: 8, message: 'Password must be at least 8 characters' }],
    }

    const form = ref<FormInstance>()

    const onSubmit = async () => {
      try {
        await form.value?.validate()
      } catch (err) {
        return
      }

      if (!recaptchaToken.value) {
        ElNotification.error('Please complete the reCAPTCHA.')
        return
      }

      const { email, password, firstName, lastName } = model.value
      isSubmitting.value = true

      try {
        await createAccountByEmail(email, password, `${firstName} ${lastName}`, recaptchaToken.value)
        hasSucceeded.value = true
      } catch (err) {
        console.log(err)
        reportError(err)
      } finally {
        isSubmitting.value = false
      }
    }

    const setReturnUrl = () => {
      setSignInReturnUrl(route)
    }

    const onClose = () => {
      store.commit('account/hideDialog', 'createAccount')
    }

    const handleLoadCallback = (response: any) => {
      recaptchaToken.value = response
    }

    return { isSubmitting, hasSucceeded, model, rules, onSubmit, setReturnUrl, onClose, form, handleLoadCallback }
  },
})
</script>

<style scoped lang="scss">
@import 'element-plus/theme-chalk/src/mixins/mixins';

.el-dialog__wrapper ::v-deep(.el-dialog) {
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
  .el-dialog__wrapper ::v-deep(.el-dialog) {
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

.g-recaptcha {
  height: 100px;
  width: 304px; /* Default reCAPTCHA width */
  display: block; /* Ensure it's visible */
}
</style>
