<template>
  <div class="sm-content-page sm-help">
    <h1>Help</h1>
    <h2>Take a tour</h2>
    <p>
      Interactively learn to use features that may be hard to discover:
    </p>
    <div class="sm-help-tours sm-help-items">
      <div>
        <el-button
          icon="el-icon-caret-right"
          @click="intro"
        >
          Introduction
        </el-button>
        <p>
          Just enough to get you started.
        </p>
      </div>
      <div>
        <el-button
          icon="el-icon-caret-right"
          @click="filtering"
        >
          Filtering
        </el-button>
        <p>
          Learn to steer through the sea of molecular annotations.
        </p>
      </div>
      <div>
        <el-button
          icon="el-icon-caret-right"
          @click="diagnostics"
        >
          Diagnostic plots
        </el-button>
        <p>
          Gain insight into how scores are assigned to molecular formulae.
        </p>
      </div>
    </div>
    <h2>Step-by-step tutorial</h2>
    <p>
      Our
      <a href="https://speakerdeck.com/metaspace2020/metaspace-training-guide">training guide</a>
      provides a step-by-step tutorial with screenshots.
    </p>
    <h2>Input format</h2>
    <p>
      Follow
      <a href="https://docs.google.com/document/d/e/2PACX-1vTT4QrMQ2RJMjziscaU8S3gbznlv6Rm5ojwrsdAXPbR5bt7Ivp-ThkC0hefrk3ZdVqiyCX7VU_ddA62/pub">our instructions</a>
      for converting datasets into imzML centroided format. If you experience difficulties, contact your instrument vendor.
    </p>
    <h2>Groups and projects</h2>
    <p>Ways for you to share your data with others:</p>
    <div class="sm-help-collaboration sm-help-items">
      <div>
        <h3>User</h3>
        <ul>
          <li>Owner of their data</li>
          <li>can make their data public</li>
          <li>can edit metadata</li>
          <li>can delete their data</li>
        </ul>
      </div>
      <div>
        <h3>Group</h3>
        <ul>
          <li>Users from same lab</li>
          <li>PI invites group members</li>
          <li>Members trust each other</li>
          <li>Members share private data</li>
        </ul>
      </div>
      <div>
        <h3>Project</h3>
        <ul>
          <li>Organise and share data</li>
          <li>Project manager invites members</li>
          <li>Members share private data</li>
          <li>Projects can be linked to publications</li>
        </ul>
      </div>
    </div>
    <h2>Feedback</h2>
    <p>
      If you have any ideas on how to improve the website, please
      <a href="https://gitter.im/metaspace2020/metaspace">chat with us on Gitter</a> or
      send them to <a href="mailto:contact@metaspace2020.eu">our e-mail address</a>.
    </p>
  </div>
</template>

<script>
import './content.css'

import Vue from 'vue'

import introTour from '../../tours/intro.ts'
import filteringTour from '../../tours/filtering.ts'
import diagnosticsTour from '../../tours/diagnostics.ts'

export default {
  name: 'HelpPage',
  methods: {
    intro() {
      this.$store.commit('startTour', introTour)
    },

    filtering() {
      this.$store.commit('startTour', filteringTour)
    },

    diagnostics() {
      this.$store.commit('startTour', diagnosticsTour)
    },
  },
}
</script>

<style>
  .sm-help-items {
    @apply flex flex-wrap justify-center -mx-3;
  }

  .sm-help-items > * {
    @apply mx-3;
    width: calc(33% - theme('spacing.6'));
  }

  .sm-help-items li + li {
    margin-top: 0;
  }

  .sm-help-tours .el-button {
    @apply text-primary flex flex-row-reverse mb-3;
  }

  .sm-help-tours .el-button span {
    margin-left: 0;
    margin-right: 8px;
  }

  .sm-help-collaboration li:first-child {
    @apply font-medium;
  }

  .sm-help-collaboration h3 {
    @apply mb-3;
  }

</style>
