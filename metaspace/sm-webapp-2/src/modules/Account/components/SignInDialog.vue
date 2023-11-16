<template>
  <el-dialog
    class="max-w-2xl"
    title="Sign in"
    v-model="model.dialogVisible"
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
              @keypress.enter="onSubmit"
            />
          </el-form-item>
          <vue3-slide-up-down v-model="isInvalid">
            <p style="margin-top: 0; color: red">
              Incorrect username or password
            </p>
          </vue3-slide-up-down>
          <el-button
            data-testid="submit-btn"
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
          @click="setReturnUrl"
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
    <vue3-slide-up-down v-model="showPreMigrationUserInfo">
      <p style="margin-bottom: 0;">
        We now require that all METASPACE users have an account to upload and manage datasets.
        If you have submitted datasets to METASPACE previously,
        please <inter-dialog-link dialog="createAccount">
          create an account
        </inter-dialog-link> using the same email address
        that you used when submitting the datasets, and you will be reunited with them.
        <a href="mailto:contact@metaspace2020.eu">Contact us</a> if you have lost access to any datasets that you submitted.
      </p>
    </vue3-slide-up-down>
  </el-dialog>
</template>


<script lang="ts">
import { defineComponent, ref, watch } from 'vue';
import { ElForm } from 'element-plus';
import { Vue3SlideUpDown } from "vue3-slide-up-down";
import GoogleButton from './GoogleButton.vue';
import InterDialogLink from './InterDialogLink';
import { signInByEmail } from '../../../api/auth';
import { refreshLoginStatus } from '../../../api/graphqlClient';
import reportError from '../../../lib/reportError';
import { setSignInReturnUrl } from '../signInReturnUrl';
import {useStore} from "vuex";

export default defineComponent({
  components: {
    Vue3SlideUpDown,
    GoogleButton,
    InterDialogLink,
  },
  setup() {
    const store = useStore()
    const isSubmitting = ref(false);
    const isInvalid = ref(false);
    const showPreMigrationUserInfo = ref(false);
    const model = ref({
      email: '',
      password: '',
      dialogVisible: true,
    });

    const rules = {
      email: [{ required: true, message: 'Email address is required' }],
      password: [{ required: true, message: 'Password is required' }],
    };

    watch(model, () => {
      isInvalid.value = false;
    }, { deep: true });

    const form = ref<InstanceType<typeof ElForm>>();

    const togglePreMigrationUserInfo = async () => {
      showPreMigrationUserInfo.value = !showPreMigrationUserInfo.value
    }

    const onSubmit = async () => {
      try {
        await form.value?.validate();
      } catch (err) {
        return
      }
      try {
        const { email, password } = model.value;
        isSubmitting.value = true;
        const authenticated = await signInByEmail(email, password);
        if (authenticated) {
          await refreshLoginStatus();
          store.commit('account/hideDialog', { dialog: 'signIn', isLoginSuccess: true })
        } else {
          form.value?.clearValidate();
          isInvalid.value = true;
        }
      } catch (err) {
        reportError(err);
      } finally {
        isSubmitting.value = false;
      }
    };

    const setReturnUrl = () => {
      setSignInReturnUrl(this.$route)
    };

    const onClose = () => {
      store.commit('account/hideDialog', 'signIn')
    };

    return {
      isSubmitting,
      isInvalid,
      showPreMigrationUserInfo,
      model,
      rules,
      form,
      togglePreMigrationUserInfo,
      onSubmit,
      setReturnUrl,
      onClose
    };
  },
});
</script>


<style scoped lang="scss">
  @import "element-plus/theme-chalk/src/mixins/mixins";

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
</style>
