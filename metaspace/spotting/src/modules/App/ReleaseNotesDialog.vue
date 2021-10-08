<template>
  <el-dialog
    class="release-notes-dialog-wrapper"
    custom-class="release-notes-dialog"
    top=""
    :visible="visible"
    @close="handleClose"
  >
    <div>
      <h1>Welcome to METASPACE 1.0!</h1>
      <p>
        If you've used METASPACE before, we need just a moment of your time to reconnect you with your previously
        submitted datasets. Please read through the following:
      </p>
      <h2>Collaboration with groups and projects</h2>
      <p>We have added new ways for you to share your data with others:</p>
      <div class="img-grp-container">
        <div class="img-grp" />
      </div>
      <h2>User accounts</h2>
      <p>
        To improve your security and control over your data, we now require METASPACE users to have accounts in
        order to submit data or to be invited to groups or projects.
        If you are using Google to log in, this will be handled automatically. If you previously used email-based login,
        please create a new account. Please use your institutional email address at first so that you're reconnected
        with your previously submitted datasets. You are free to change your email address after sign-up.
      </p>
      <div class="img-acct-container">
        <div class="img-acct" />
      </div>
      <p>
        With the old email-based logins, we found many people spread their datasets across several email addresses,
        depending on which they had open at the time. As this is no longer a problem with password-based logins, we've
        done a one-time cleanup, consolidating datasets to institutional email addresses when one has been used.
        If you are unable to access your previously submitted datasets or have any concerns about privacy
        or data ownership with the new sharing features, please <a href="mailto:contact@metaspace2020.eu">get in touch</a>.
      </p>
      <div style="display: flex;align-items: center;">
        <div style="flex-grow: 1">
          <el-checkbox v-model="dontShowAgain">
            I understand, don't show this again
          </el-checkbox>
        </div>
        <div style="justify-self: flex-end">
          <el-button
            type="primary"
            @click="handleClose"
          >
            Close
          </el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script lang="ts">
import Vue from 'vue'
import Component from 'vue-class-component'
import { getLocalStorage, setLocalStorage } from '../../lib/localStorage'

const CURRENT_VERSION = 1

  @Component
export default class ReleaseNotesDialog extends Vue {
    visible = (getLocalStorage<number>('hideReleaseNotes') || 0) < CURRENT_VERSION;
    dontShowAgain = false;

    handleClose() {
      this.visible = false
      if (this.dontShowAgain) {
        setLocalStorage('hideReleaseNotes', CURRENT_VERSION, true)
      }
    }
}
</script>
<style lang="scss">
  .release-notes-dialog-wrapper {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .release-notes-dialog {
    width: 1000px;
    max-width: 90vw;
    max-height: 90%;
    overflow-y: auto;
    margin: 0 auto;

    h1 {
      text-align: center;
      padding-bottom: 20px;
    }

    .el-dialog__header {
      display: none;
    }
    .el-dialog__body {
      font-size: 16px;
    }
  }
</style>
<style scoped lang="scss">
  .img-acct-container {
    max-width: 721px * 0.75;
    max-height: 139px * 0.75;
    margin-left: auto;
    margin-right: auto;
  }
  .img-grp-container {
    max-width: 800px;
    max-height: 293px;
    margin-left: auto;
    margin-right: auto;
  }
  .img-acct {
    background: url('../../assets/release_notes_create_account.png') no-repeat center;
    background-size: contain;
    box-sizing: border-box;
    padding-top: 139/721*100%; // Maintain aspect ratio
  }
  .img-grp {
    background: url('../../assets/release_notes_groups_and_projects.png') no-repeat center;
    background-size: contain;
    box-sizing: border-box;
    padding-top: 293/800*100%; // Maintain aspect ratio
  }
</style>
