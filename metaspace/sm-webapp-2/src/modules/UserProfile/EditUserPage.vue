<template>
  <div class="main-content">
    <el-dialog
      title="Delete account"
      class="delete-account-dialog"
      :model-value="showDeleteAccountDialog"
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
          @click="deleteAccount"
        >
          Delete account
        </el-button>
      </div>
      <p>
        <b>Note:</b> if you choose not to delete the datasets now, you will still be able to have them
        deleted later by emailing the <a target="_blank" href="mailto:contact@metaspace2020.eu">METASPACE administrators</a>.
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
          ref="formRef"
          class="w-full"
          :disabled="isUserDetailsLoading"
          :rules="rules"
          :model="model"
          label-position="top"
        >
          <div class="flex flex-wrap w-full">
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
                  class="cursor-pointer"
                  style="color: #1768AF;margin-left: 16px; line-height: 32px"
                  link
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
            To <a target="_blank" href="https://github.com/metaspace2020/metaspace/tree/master/metaspace/python-client">access METASPACE programmatically</a>
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
            @click="openDeleteAccountDialog"
          >
            Delete account
          </el-button>
        </div>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
import {defineComponent, ref, reactive, computed, inject} from 'vue';
import {ElForm, ElMessage, ElMessageBox, ElCheckbox, ElButton, ElCol, ElRow, ElInput, ElFormItem, ElLoading} from 'element-plus';
import {
  updateUserMutation,
  deleteUserMutation,
  userProfileQuery,
  resetUserApiKeyMutation,
} from '../../api/user'
import reportError from '../../lib/reportError';
import { refreshLoginStatus } from '../../api/graphqlClient'
import emailRegex from '../../lib/emailRegex';
import GroupsTable from './GroupsTable';
import ProjectsTable from './ProjectsTable.vue';
import { useConfirmAsync } from '../../components/ConfirmAsync'
import { sendPasswordResetToken } from '../../api/auth'
import CopyToClipboard from '../../components/Form/CopyToClipboard';
import {DefaultApolloClient, useQuery} from "@vue/apollo-composable";
import {useRouter} from "vue-router";

export default defineComponent({
  name: 'EditUserPage',

  components: {
    GroupsTable,
    ProjectsTable,
    CopyToClipboard,
    ElCheckbox,
    ElButton, ElCol, ElRow, ElInput, ElFormItem, ElForm
  },

  directives: {
    'loading': ElLoading.directive,
  },

  setup() {
    const router = useRouter();
    const apolloClient = inject(DefaultApolloClient);
    const confirmAsync = useConfirmAsync();
    const formRef = ref<InstanceType<typeof ElForm>>();


    const isLoaded = ref(false);
    const showApiKey = ref(false);
    const showDeleteAccountDialog = ref(false);
    const isUserDetailsLoading = ref(false);
    const isUserDeletionLoading = ref(false);
    const isEmailChangePending = ref(false);
    const isChangingPrimaryGroup = ref(false);
    const primaryGroupId = ref(null);
    const delDatasets = ref(false);



    const model = reactive({
      name: '',
      email: '',
    });

    const rules = {
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

    const {result: currentUserResult,onResult: onUserProfileResult, refetch: currentUserRefetch} = useQuery(userProfileQuery, null, {fetchPolicy: 'network-only'})
    const currentUser = computed(() => currentUserResult.value?.currentUser)
    onUserProfileResult(() => {
      if (!isLoaded.value) {
        // Not using 'loadingKey' pattern here to avoid getting a full-page loading spinner when the user clicks a
        // button that causes this query to refetch
        isLoaded.value = true
      }
      onCurrentUserChanged()
    })

    const isUserDetailsPristine = computed(() => {
      return currentUser.value == null
        || (model.name === currentUser.value.name && model.email === currentUser.value.email);
    });

    const  onCurrentUserChanged = () => {
      if (currentUser.value) {
        model.name = currentUser.value.name;
        if (!isEmailChangePending.value) {
          model.email = currentUser.value.email;
        }
        primaryGroupId.value = currentUser.value.primaryGroup && currentUser.value.primaryGroup.group.id ? currentUser.value.primaryGroup.group.id : null;
      }else if(isLoaded.value){
        router.push('/account/sign-in')
      }
    };

    const openDeleteAccountDialog = () => {
      showDeleteAccountDialog.value = true;
    };

    const closeDeleteAccountDialog = () => {
      showDeleteAccountDialog.value = false;
    };

    const updateUserDetails = async() => {
      try {
        await (formRef.value as any).validate()
      } catch (err) {
        return
      }
      try {
        const emailChanged = model.email &&  currentUser.value.email && (currentUser.value.email !== model.email)
        if (emailChanged) {
          try {
            await ElMessageBox.confirm(
              'Are you sure you want to change email address? '
              + 'A verification email will be sent to your new address to confirm the change.',
              'Confirm email address change', {
                confirmButtonText: 'Yes, send verification email',
                lockScroll: false,
              })
            isEmailChangePending.value = true
          } catch {
            return
          }
        }
        isUserDetailsLoading.value = true

        await apolloClient.mutate({
          mutation: updateUserMutation,
          variables: {
            userId: currentUser.value.id,
            update: {
              // Only send fields that have changed, per API requirements
              // This relies on `undefined` values being discarded during JSON stringification
              name: model.name !== currentUser.value.name ? model.name : undefined,
              email: model.email !== currentUser.value.email ? model.email : undefined,
            },
          },
        })

        await currentUserRefetch()
        ElMessage({
          type: 'success',
          message: emailChanged
            ? 'A verification link has been sent to your new email address. '
            + 'Please click the link in this email to confirm the change.'
            : 'Your details have been saved',
        })
      } catch (err) {
        reportError(err)
      } finally {
        isUserDetailsLoading.value = false
      }
    }

    const  deleteAccount = async () => {
      try {
        isUserDeletionLoading.value = true
        await apolloClient.mutate({
          mutation: deleteUserMutation,
          variables: {
            userId: currentUser.value.id,
            deleteDatasets: delDatasets.value,
          },
        })
        ElMessage({
          type: 'success',
          message: 'You have successfully deleted your account!',
        })
      } catch (err) {
        reportError(err)
      } finally {
        await refreshLoginStatus()
        closeDeleteAccountDialog()
        isUserDeletionLoading.value = false
      }
    }

    const handleChangePassword = async () => {
      const confirmOptions = {
        message: 'This will send you an email with a link and instructions to change your password. '
          + 'Do you wish to proceed?',
        confirmButtonText: 'Change password',
        confirmButtonLoadingText: 'Sending email...',
      };

      await confirmAsync(confirmOptions, async () => {
        // TODO: Customize this so it's not so obviously a rip off of the reset password process
        await sendPasswordResetToken(currentUser.value.email!)
        ElMessage({ message: 'Email sent!', type: 'success' })
      });
    }

    const handleChangePrimaryGroup = async() => {
      const oldPrimaryGroupId = currentUser.value.primaryGroup != null ? currentUser.value.primaryGroup!.group.id : null

      if (primaryGroupId.value !== oldPrimaryGroupId) {
        isChangingPrimaryGroup.value = true
        try {
          await apolloClient.mutate({
            mutation: updateUserMutation,
            variables: {
              userId: currentUser.value.id,
              update: { primaryGroupId: primaryGroupId.value },
            },
          })
          await currentUserRefetch()
        } finally {
          isChangingPrimaryGroup.value = false
        }
      }
    }

    const handleGenerateApiKey = async () => {
      const confirmOptions = {
        dangerouslyUseHTMLString: true,
        message: `API keys allow almost full access to your account, including data shared with you by others,
        and should not be shared with anybody you don't trust.<br><br>
        If you are no longer using your API key or you accidentally share it publicly,
        revoke the key to prevent unwanted access to your account.`,
        confirmButtonText: 'I understand, generate the key',
        confirmButtonLoadingText: 'Generating...',
      };

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: resetUserApiKeyMutation,
          variables: {
            userId: currentUser.value.id,
            removeKey: false,
          },
        })
        await currentUserRefetch()
      });
    }
    const handleRevokeApiKey = async () => {
      const confirmOptions = {
        message: 'Are you sure you want to revoke the API key?',
        confirmButtonText: 'Revoke key',
        confirmButtonLoadingText: 'Revoking...',
      };

      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: resetUserApiKeyMutation,
          variables: {
            userId: currentUser.value.id,
            removeKey: true,
          },
        })
        await currentUserRefetch()
      });
    }

    const handleCopyApiKey = () => {
      if (currentUser.value && currentUser.value.apiKey) {
        if ('clipboard' in navigator) {
          navigator.clipboard.writeText(currentUser.value.apiKey)
        } else {
          const el = document.createElement('textarea')
          el.value = currentUser.value.apiKey
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

    const refetchData = async () => {
      await currentUserRefetch()
    }

    return {
      formRef,
      isLoaded,
      showApiKey,
      showDeleteAccountDialog,
      isUserDetailsLoading,
      isUserDeletionLoading,
      isEmailChangePending,
      isChangingPrimaryGroup,
      currentUser,
      model,
      primaryGroupId,
      delDatasets,
      rules,
      isUserDetailsPristine,
      openDeleteAccountDialog,
      closeDeleteAccountDialog,
      updateUserDetails,
      deleteAccount,
      handleChangePassword,
      handleChangePrimaryGroup,
      handleGenerateApiKey,
      handleRevokeApiKey,
      handleCopyApiKey,
      refetchData,
    };
  },
});
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

  .api-key ::v-deep(input) {
    background-color: white !important;
    cursor: text !important;
  }

  .saveButton {
    width: 100px;
    padding: 8px;
    float: right;
    margin: 20px 0;
  }

  ::v-deep(.delete-account-dialog) .el-dialog__body {
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
