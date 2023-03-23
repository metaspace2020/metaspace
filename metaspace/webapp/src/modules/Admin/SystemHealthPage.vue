<template>
  <div
    v-if="isAdmin"
    v-loading="loading"
    class="mx-auto max-w-4xl"
  >
    <el-form label-position="top">
      <el-form-item>
        <el-radio-group v-model="mode">
          <el-radio
            border
            :label="0"
          >
            Enable everything
          </el-radio>
          <el-radio
            border
            :label="1"
          >
            Disable dataset upload/reprocessing
          </el-radio>
          <el-radio
            border
            :label="2"
          >
            Read-only mode
          </el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="Maintenance message (optional)">
        <el-input
          v-model="message"
          style="width: 450px;"
        />
      </el-form-item>
      <el-button
        :type="buttonType"
        :loading="isUpdating"
        @click="handleSubmit"
      >
        {{ buttonText }}
      </el-button>
    </el-form>
  </div>
</template>

<script>
import { getSystemHealthQuery, getSystemHealthSubscribeToMore, updateSystemHealthMutation } from '../../api/system'
import reportError from '../../lib/reportError'
import { currentUserRoleQuery } from '../../api/user'

/** @type {ComponentOptions<Vue> & Vue} */
const SystemHealthPage = {
  name: 'SystemHealthPage',
  data() {
    return {
      mode: 0,
      message: '',
      loading: 0,
      isUpdating: false,
      buttonType: 'primary',
      buttonText: 'Update',
      currentUser: null,
      systemHealth: null,
    }
  },
  computed: {
    isAdmin() {
      return this.currentUser && this.currentUser.role === 'admin'
    },
  },
  apollo: {
    currentUser: {
      query: currentUserRoleQuery,
      fetchPolicy: 'cache-first',
    },
    systemHealth: {
      query: getSystemHealthQuery,
      subscribeToMore: getSystemHealthSubscribeToMore,
      loadingKey: 'isLoadingInitial',
      result(res) {
        const { canMutate, canProcessDatasets, message } = res.data.systemHealth
        this.mode = !canMutate ? 2 : !canProcessDatasets ? 1 : 0
        this.message = message
      },
    },
  },
  methods: {
    async handleSubmit() {
      try {
        this.isUpdating = true
        await this.$apollo.mutate({
          mutation: updateSystemHealthMutation,
          variables: {
            health: {
              canMutate: this.mode < 2,
              canProcessDatasets: this.mode < 1,
              message: this.message ? this.message : null,
            },
          },
        })
        this.buttonType = 'success'
        this.buttonText = 'Updated'
      } catch (err) {
        // reportError(err)
        this.buttonType = 'danger'
        this.buttonText = 'Error'
      } finally {
        this.isUpdating = false
      }
    },
  },
}

export default SystemHealthPage
</script>

<style scoped>
  .el-radio {
    display: block;
  }
  .el-radio + .el-radio {
    margin: 5px 0 !important;
  }
</style>
