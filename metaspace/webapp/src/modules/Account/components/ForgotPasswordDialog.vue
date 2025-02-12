<template>
  <el-dialog title="Reset password" v-model="model.dialogVisible" :lock-scroll="false" @close="onClose">
    <div v-if="hasSucceeded">
      <p>Please check your email for further instructions.</p>
    </div>
    <div v-else>
      <el-form ref="form" :model="model" :rules="rules">
        <p>
          Please enter the email address you used to sign up to METASPACE and we will send you an email with a link for
          resetting your password.
        </p>
        <el-form-item prop="email">
          <el-input v-model="model.email" placeholder="Email address" @keypress.enter="onSubmit" />
        </el-form-item>
        <el-button type="primary" :loading="isSubmitting" @click="onSubmit"> Reset password </el-button>
      </el-form>
      <h1 />
      <p>Has your email address changed? <a href="mailto:contact@metaspace2020.org">Contact us</a></p>
    </div>
  </el-dialog>
</template>

<script lang="ts">
import { defineComponent, reactive, ref } from 'vue'
import { ElForm } from '../../../lib/element-plus'
import { sendPasswordResetToken } from '../../../api/auth'
import reportError from '../../../lib/reportError'
import { useStore } from 'vuex'

export default defineComponent({
  setup() {
    const store = useStore()
    const isSubmitting = ref(false)
    const hasSucceeded = ref(false)
    const model = reactive({
      email: '',
      dialogVisible: true,
    })

    const rules = {
      email: [{ required: true, message: 'Email address is required' }],
    }

    const form = ref<InstanceType<typeof ElForm>>()

    const onSubmit = async () => {
      try {
        await form.value?.validate()
      } catch (err) {
        return
      }

      try {
        isSubmitting.value = true
        await sendPasswordResetToken(model.email)
        hasSucceeded.value = true
      } catch (err) {
        if (err !== false) {
          reportError(err)
        }
      } finally {
        isSubmitting.value = false
      }
    }

    const onClose = () => {
      store.commit('account/hideDialog', 'forgotPassword')
    }

    return { isSubmitting, hasSucceeded, model, rules, onSubmit, onClose, form }
  },
})
</script>

<style scoped lang="scss">
@import 'element-plus/theme-chalk/src/mixins/mixins';

.el-dialog__wrapper ::v-deep(.el-dialog) {
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
