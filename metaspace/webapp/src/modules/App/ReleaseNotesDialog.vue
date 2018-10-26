<template>
  <el-dialog
    custom-class="release-notes-dialog"
    :visible="visible"
    @close="handleClose">
    <div>
      <h1>Welcome to METASPACE 1.0!</h1>
      <p>If this is your first time here, feel free to skip this.</p>
      <p>
        If you've used METASPACE before, we need just a moment of your time to reconnect you with your previously
        submitted datasets. Please read through the following:
      </p>
      <h2>User accounts</h2>
      <div class="img-container"><div class="img-acct" /></div>
      <p>
        To improve your security and control over your data, we now require METASPACE contributors to have accounts.
        If you are using Google to log in, this will be handled automatically. If you previously used email-based login,
        you will now have to create a new account using your old email address. Please use your institutional
        email address at first so that you're reconnected with your previously submitted datasets. You are free to
        change your email address after sign-up.
      </p>
      <p>
      </p>
      <h2>Collaboration with groups and projects</h2>
      <div class="img-container"><div class="img-grp" /></div>
      <p>
        Private data sets are now automatically shared with the rest of your Group (institution, lab, etc.). If you wish
        to opt out of this behavior, please select "No Group" when submitting your datasets.
      </p>
      <p>
        Projects are a new way to organize datasets and share them between collaborators.
      </p>
      <h2>Data changes</h2>
      <p>
        With the old email-based logins, we found many people spread their datasets across several email addresses,
        depending on which they had open at the time. As this is no longer a problem with password-based logins, we've
        done a one-time cleanup, consolidating datasets to institutional email addresses when one has been used.
        If you are unable to access your previously submitted datasets or have any concerns about privacy
        or data ownership with the new sharing features, please <a href="mailto:contact@metaspace2020.eu">get in touch</a>.
      </p>
      <div style="display: flex;align-items: center;">
        <div style="flex-grow: 1">
          <el-checkbox v-model="dontShowAgain">I understand, don't show this again</el-checkbox>
        </div>
        <div style="justify-self: flex-end">
          <el-button type="primary" @click="handleClose">Close</el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script lang="ts">
  import Vue from 'vue';
  import Component from 'vue-class-component';
  import * as cookie from 'js-cookie';

  const CURRENT_VERSION = 1;

  @Component
  export default class ReleaseNotesDialog extends Vue {
    visible = (cookie.getJSON('hideReleaseNotes') as any as number || 0) < CURRENT_VERSION;
    dontShowAgain = false;

    handleClose() {
      this.visible = false;
      if (this.dontShowAgain) {
        cookie.set('hideReleaseNotes', CURRENT_VERSION as any);
      }
    }
  }
</script>

<style scoped lang="scss">
  /deep/ .release-notes-dialog {
    width: 1000px;
    max-width: 90vw;

    h1 {
      text-align: center;
      padding-bottom: 20px;
    }

    .el-dialog__header {
      display: none;
    }
  }
  .img-container {
    display: flex;
    justify-content: center;
  }
  .img-acct .img-grp {
    position: relative;
    flex-grow: 1;
    background-size: contain;
    box-sizing: border-box;
  }
  .img-acct {
    max-width: 721px;
    max-height: 139px;
    background: url('../../assets/release_notes_create_account.png') no-repeat center;
    padding-top: 139/721*100%; // Maintain aspect ratio
  }
  .img-grp {
    max-width: 800px;
    max-height: 293px;
    background: url('../../assets/release_notes_groups_and_projects.png') no-repeat center;
    padding-top: 293/800*100%; // Maintain aspect ratio
  }
</style>
