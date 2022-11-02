<template>
  <div class="main-content">
    <el-dialog
      title="Delete account"
      custom-class="delete-account-dialog"
      :visible.sync="showDeleteAccountDialog"
      width="500px"
      :lock-scroll="false"
    >
      <p>
        If you delete your account, you will lose access to all private datasets.
      </p>
      <p>
        Please select whether you would like to delete all your datasets or keep them within METASPACE accessible by the group members:
      </p>
      <!--Changed the Text below to the above version after discussion with Theo, plz consider if it fits-->
      <!--If you delete your account, you will lose access to any datasets, groups and-->
      <!--projects that have been explicitly shared with you-->
      <el-checkbox
        v-model="delDatasets"
        style="margin: 10px 20px"
      >
        Delete datasets that I have submitted
      </el-checkbox>
      <div style="margin: 10px 0 20px; text-align: right;">
        <el-button
          title="Cancel"
          @click="closeDeleteAccountDialog"
        >
          Cancel
        </el-button>
        <el-button
          type="danger"
          title="Delete account"
          :loading="isUserDeletionLoading"
          @click="deleteAccount()"
        >
          Delete account
        </el-button>
      </div>
      <p>
        <b>Note:</b> if you choose not to delete the datasets now, you will still be able to have them
        deleted later by emailing the <a href="mailto:contact@metaspace2020.eu">METASPACE administrators</a>.
      </p>
    </el-dialog>
    <div
      v-loading="!isLoaded"
      class="user-edit-page"
    >
      <el-row>
        <el-col :span="16">
          <h2>User details</h2>
        </el-col>
        <el-col :span="8">
          <el-button
            title="Save"
            type="primary"
            :disabled="isUserDetailsPristine"
            class="saveButton"
            :loading="isUserDetailsLoading"
            @click="updateUserDetails"
          >
            Save
          </el-button>
        </el-col>
      </el-row>
      <el-row :gutter="20">
        <el-form
          ref="form"
          :disabled="isUserDetailsLoading"
          :rules="rules"
          :model="model"
          label-position="top"
        >
          <div>
            <el-col :span="8">
              <el-form-item
                prop="name"
                label="Full name"
              >
                <el-input
                  v-model="model.name"
                  name="name"
                />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item
                prop="email"
                label="Email address"
              >
                <el-input
                  v-model="model.email"
                  name="email"
                />
              </el-form-item>
              <p v-if="isEmailChangePending">
                <b>Please click the link that has been sent to your new email address to verify the change.</b>
              </p>
            </el-col>
            <el-col :span="8">
              <el-form-item
                label="Password"
                required
              >
                <el-button
                  style="margin-left: 16px"
                  type="text"
                  @click="handleChangePassword"
                >
                  Click to change...
                </el-button>
              </el-form-item>
            </el-col>
          </div>
        </el-form>
      </el-row>

      <div>
        <h2>Groups</h2>
        <groups-table
          :current-user="currentUser"
          :refetch-data="refetchData"
        />
        <div v-if="currentUser && currentUser.groups && currentUser.groups.length > 1">
          <p>Primary group:</p>
          <el-select
            v-model="primaryGroupId"
            v-loading="isChangingPrimaryGroup"
            placeholder="Select"
            style="width: 400px;"
            @change="handleChangePrimaryGroup"
          >
            <el-option
              v-for="userGroup in currentUser.groups"
              :key="userGroup.group.id"
              :label="userGroup.group.name"
              :value="userGroup.group.id"
            />
          </el-select>
        </div>
      </div>

      <div style="margin-top: 40px;">
        <h2>Projects</h2>
        <projects-table
          :current-user="currentUser"
          :refetch-data="refetchData"
        />
      </div>
      <!--The section below will be introduced in vFuture-->
      <!--<div class="notifications" style="margin-top: 30px">-->
      <!--<h2>Notifications</h2>-->
      <!--<div class="notification-list" style="padding-left: 10px">-->
      <!--<el-row :gutter="0">-->
      <!--<el-col :span="12"><p>Send an email when:</p>-->
      <!--<el-checkbox-group-->
      <!--class="notifications">-->
      <!--<div class="notifications_checkbox">-->
      <!--<el-checkbox-->
      <!--label="My dataset's processing has successfully finished"></el-checkbox>-->
      <!--</div>-->
      <!--<div class="notifications_checkbox">-->
      <!--<el-checkbox class="notifications_checkbox"-->
      <!--label="My dataset's processing failed"></el-checkbox>-->
      <!--</div>-->
      <!--</el-checkbox-group>-->
      <!--<p>Show a notification when:</p>-->
      <!--<el-checkbox-group :indeterminate="isIndeterminate" v-model="checkList"-->
      <!--class="notifications">-->
      <!--<div class="notifications_checkbox">-->
      <!--<el-checkbox class="notifications_checkbox"-->
      <!--label="My dataset's processing has successfully finished"></el-checkbox>-->
      <!--</div>-->
      <!--<div class="notifications_checkbox">-->
      <!--<el-checkbox class="notifications_checkbox"-->
      <!--label="A dataset is added to a group or project that I belong to"></el-checkbox>-->
      <!--</div>-->
      <!--<div class="notifications_checkbox">-->
      <!--<el-checkbox class="notifications_checkbox"-->
      <!--label="A public dataset has been added to the queue"></el-checkbox>-->
      <!--</div>-->
      <!--<div class="notifications_checkbox">-->
      <!--<el-checkbox class="notifications_checkbox"-->
      <!--label="A public dataset has finished processing"></el-checkbox>-->
      <!--</div>-->
      <!--</el-checkbox-group>-->
      <!--</el-col>-->
      <!--</el-row>-->
      <!--</div>-->
      <!--</div>-->
      <section>
        <h2>API access</h2>
        <div class="action-with-message">
          <p class="max-w-measure-4">
            To <a href="https://github.com/metaspace2020/metaspace/tree/master/metaspace/python-client">access METASPACE programmatically</a>
            or integrate with trusted third-party applications, an API key can be used to avoid sharing your password.
          </p>
          <el-button
            v-if="currentUser && !currentUser.apiKey"
            @click="handleGenerateApiKey"
          >
            Generate API key
          </el-button>
        </div>
        <el-row v-if="isLoaded && currentUser">
          <div
            v-if="currentUser.apiKey"
            class="action-with-message"
          >
            <copy-to-clipboard
              class="max-w-measure-1"
              :value="currentUser.apiKey"
              type="password"
            />
            <el-button
              type="danger"
              @click="handleRevokeApiKey"
            >
              Revoke key
            </el-button>
          </div>
        </el-row>
      </section>
      <section>
        <h2>Delete account</h2>
        <div class="action-with-message">
          <p class="max-w-measure-3">
            If you delete your METASPACE account, you can optionally remove all of your datasets.
            If datasets are not removed, the private data will still be accessible by the group members only.
          </p>
          <el-button
            type="danger"
            title="Delete account"
            @click="openDeleteAccountDialog()"
          >
            Delete account
          </el-button>
        </div>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Watch } from 'vue-property-decorator'
import {
  updateUserMutation,
  deleteUserMutation,
  userProfileQuery,
  UserProfileQuery, resetUserApiKeyMutation,
} from '../../api/user'
import reportError from '../../lib/reportError'
import { refreshLoginStatus } from '../../api/graphqlClient'
import { ElForm } from 'element-ui/types/form'
import { TransferDatasetsDialog } from '../Group/index'
import emailRegex from '../../lib/emailRegex'
import GroupsTable from './GroupsTable'
import ProjectsTable from './ProjectsTable.vue'
import ConfirmAsync from '../../components/ConfirmAsync'
import { sendPasswordResetToken } from '../../api/auth'
import CopyToClipboard from '../../components/Form/CopyToClipboard'

  interface Model {
    name: string;
    email: string | null;
  }

  @Component<EditUserPage>({
    components: {
      TransferDatasetsDialog,
      GroupsTable,
      ProjectsTable,
      CopyToClipboard,
    },
    apollo: {
      currentUser: {
        query: userProfileQuery,
        result({ data }: {data: {currentUser: UserProfileQuery}}) {
          if (!this.isLoaded) {
            // Not using 'loadingKey' pattern here to avoid getting a full-page loading spinner when the user clicks a
            // button that causes this query to refetch
            this.isLoaded = true
          }
        },
      },
    },
  })
export default class EditUserPage extends Vue {
    isLoaded = false;
    showApiKey = false;
    showDeleteAccountDialog: boolean = false;
    isUserDetailsLoading: boolean = false;
    isUserDeletionLoading: boolean = false;
    isEmailChangePending: boolean = false;
    isChangingPrimaryGroup: boolean = false;

    currentUser: UserProfileQuery | null = null;
    model: Model = {
      name: '',
      email: '',
    };

    primaryGroupId: string | null = null;

    delDatasets: boolean = false;
    rules: object = {
      name: [
        { required: true, min: 3, max: 50, message: 'Please enter a correct fullname', trigger: 'blur' },
      ],
      email: [
        {
          required: true,
          pattern: emailRegex,
          message: 'Please enter a valid email address',
          trigger: 'blur',
        }],
    };

    get isUserDetailsPristine() {
      return this.currentUser == null
        || (this.model.name === this.currentUser.name && this.model.email === this.currentUser.email)
    }

    @Watch('isLoaded')
    @Watch('currentUser', { deep: true })
    onCurrentUserChanged(this: any) {
      if (this.currentUser) {
        this.model.name = this.currentUser.name
        if (!this.isEmailChangePending) {
          this.model.email = this.currentUser.email
        }
        this.primaryGroupId = this.currentUser.primaryGroup ? this.currentUser.primaryGroup.group.id : null
      } else if (this.isLoaded) {
        this.$router.push('/account/sign-in')
      }
    }

    openDeleteAccountDialog() {
      this.showDeleteAccountDialog = true
    }

    closeDeleteAccountDialog() {
      this.showDeleteAccountDialog = false
    }

    async updateUserDetails() {
      try {
        await (this.$refs.form as ElForm).validate()
      } catch (err) {
        return
      }
      try {
        const emailChanged = this.currentUser!.email !== this.model.email
        if (emailChanged) {
          try {
            await this.$confirm(
              'Are you sure you want to change email address? '
              + 'A verification email will be sent to your new address to confirm the change.',
              'Confirm email address change', {
                confirmButtonText: 'Yes, send verification email',
                lockScroll: false,
              })
            this.isEmailChangePending = true
          } catch {
            return
          }
        }
        this.isUserDetailsLoading = true

        await this.$apollo.mutate({
          mutation: updateUserMutation,
          variables: {
            userId: this.currentUser!.id,
            update: {
              // Only send fields that have changed, per API requirements
              // This relies on `undefined` values being discarded during JSON stringification
              name: this.model.name !== this.currentUser!.name ? this.model.name : undefined,
              email: this.model.email !== this.currentUser!.email ? this.model.email : undefined,
            },
          },
        })
        await this.$apollo.queries.currentUser.refetch()
        this.$message({
          type: 'success',
          message: emailChanged
            ? 'A verification link has been sent to your new email address. '
            + 'Please click the link in this email to confirm the change.'
            : 'Your details have been saved',
        })
      } catch (err) {
        reportError(err)
      } finally {
        this.isUserDetailsLoading = false
      }
    }

    async deleteAccount(this: any) {
      try {
        this.isUserDeletionLoading = true
        await this.$apollo.mutate({
          mutation: deleteUserMutation,
          variables: {
            userId: this.currentUser.id,
            deleteDatasets: this.delDatasets,
          },
        })
        this.$message({
          type: 'success',
          message: 'You have successfully deleted your account!',
        })
      } catch (err) {
        reportError(err)
      } finally {
        await refreshLoginStatus()
        this.closeDeleteAccountDialog()
        this.isUserDeletionLoading = false
      }
    }

    @ConfirmAsync(function(this: EditUserPage) {
      return {
        message: 'This will send you an email with a link and instructions to change your password. '
          + 'Do you wish to proceed?',
        confirmButtonText: 'Change password',
        confirmButtonLoadingText: 'Sending email...',
      }
    })
    async handleChangePassword() {
      // TODO: Customize this so it's not so obviously a rip off of the reset password process
      await sendPasswordResetToken(this.currentUser!.email!)
      this.$message({ message: 'Email sent!', type: 'success' })
    }

    async handleChangePrimaryGroup() {
      const oldPrimaryGroupId = this.currentUser!.primaryGroup != null ? this.currentUser!.primaryGroup!.group.id : null

      if (this.primaryGroupId !== oldPrimaryGroupId) {
        this.isChangingPrimaryGroup = true
        try {
          await this.$apollo.mutate({
            mutation: updateUserMutation,
            variables: {
              userId: this.currentUser!.id,
              update: { primaryGroupId: this.primaryGroupId },
            },
          })
          await this.$apollo.queries.currentUser.refetch()
        } finally {
          this.isChangingPrimaryGroup = false
        }
      }
    }

    @ConfirmAsync(function(this: EditUserPage) {
      return {
        dangerouslyUseHTMLString: true,
        message: `API keys allow almost full access to your account, including data shared with you by others,
        and should not be shared with anybody you don't trust.<br><br>
        If you are no longer using your API key or you accidentally share it publicly,
        revoke the key to prevent unwanted access to your account.`,
        confirmButtonText: 'I understand, generate the key',
        confirmButtonLoadingText: 'Generating...',
      }
    })
    async handleGenerateApiKey() {
      await this.$apollo.mutate({
        mutation: resetUserApiKeyMutation,
        variables: {
          userId: this.currentUser!.id,
          removeKey: false,
        },
      })
      await this.$apollo.queries.currentUser.refetch()
    }

    @ConfirmAsync(function(this: EditUserPage) {
      return {
        message: 'Are you sure you want to revoke the API key?',
        confirmButtonText: 'Revoke key',
        confirmButtonLoadingText: 'Revoking...',
      }
    })
    async handleRevokeApiKey() {
      await this.$apollo.mutate({
        mutation: resetUserApiKeyMutation,
        variables: {
          userId: this.currentUser!.id,
          removeKey: true,
        },
      })
      await this.$apollo.queries.currentUser.refetch()
    }

    handleCopyApiKey() {
      if (this.currentUser && this.currentUser.apiKey) {
        if ('clipboard' in navigator) {
          navigator.clipboard.writeText(this.currentUser.apiKey)
        } else {
          const el = document.createElement('textarea')
          el.value = this.currentUser!.apiKey
          el.style.position = 'absolute'
          el.style.left = '-9999px'
          document.body.appendChild(el)
          try {
            el.select()
            document.execCommand('copy')
          } finally {
            document.body.removeChild(el)
          }
        }
      }
    }

    async refetchData() {
      await this.$apollo.queries.currentUser.refetch()
    }
}
</script>

<style scoped>
  .main-content {
    @apply px-6 py-3;
    display: flex;
    justify-content: center;
  }

  .user-edit-page {
    max-width: 950px;
    width: 100%;
  }

  .api-key /deep/ input {
    background-color: white !important;
    cursor: text !important;
  }

  .saveButton {
    width: 100px;
    padding: 8px;
    float: right;
    margin: 20px 0;
  }

  /deep/ .delete-account-dialog .el-dialog__body {
    padding: 0 20px 20px 20px;
  }

  /* Uncomment when the vFuture notifications will be introduced */
  /*.notifications_checkbox {*/
    /*margin-left: 0;*/
    /*padding: 0;*/
  /*}*/

  .action-with-message {
    align-items: flex-start;
    display: flex;
    justify-content: space-between;
  }

  .action-with-message > :first-child {
    margin-top: 0;
    margin-right: 20px;
  }

  .action-with-message p {
    font-size: 16px;
    line-height: 1.5;
  }

  section + section {
    @apply my-12;
  }
</style>
