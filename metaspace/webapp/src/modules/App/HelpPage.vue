<template>
  <div class="sm-content-page">
    <h1>Help</h1>
    <h2>Interactive tours</h2>
    <p>
      Learn to use features that may be hard to discover:
    </p>
    <div class="tours column-layout">
      <div>
        <h3>Introduction</h3>
        <p>
          An overview with just enough to get you started.
        </p>
        <tour-button @click="intro">
          Take the tour
        </tour-button>
      </div>
      <div>
        <h3>Filtering</h3>
        <p>
          Navigate the sea of molecular annotations effectively.
        </p>
        <tour-button @click="filtering">
          Take the tour
        </tour-button>
      </div>
      <div>
        <h3>Diagnostic plots</h3>
        <p>
          Gain insight into how scores are assigned to molecular formulae.
        </p>
        <tour-button @click="diagnostics">
          Take the tour
        </tour-button>
      </div>
    </div>
    <h2>Step-by-step tutorial</h2>
    <p>
      Our
      <a href="https://docs.google.com/presentation/d/10h6Kle2hdW_Ma9SdkuFIUiUOT5lBXexZs1jFDb7X08Q/edit?usp=sharing">training guide</a>
      provides a step-by-step tutorial with screenshots.
    </p>
    <h2>Input format</h2>
    <p>
      Follow
      <a href="https://docs.google.com/document/d/e/2PACX-1vTT4QrMQ2RJMjziscaU8S3gbznlv6Rm5ojwrsdAXPbR5bt7Ivp-ThkC0hefrk3ZdVqiyCX7VU_ddA62/pub">our instructions</a>
      for converting datasets into imzML centroided format. If you experience difficulties, contact your instrument vendor.
    </p>
    <h2>Collaboration</h2>
    <p>Share your data with others in the following ways:</p>
    <div
      class="collaboration column-layout"
    >
      <div>
        <user-icon class="sm-colour-icon" />
        <h3>User</h3>
        <ul>
          <li>owner of their data</li>
          <li>can make their data public</li>
          <li>can edit metadata</li>
          <li>can delete their data</li>
        </ul>
      </div>
      <div>
        <group-icon class="sm-colour-icon" />
        <h3>Group</h3>
        <ul>
          <li>users from same lab</li>
          <li>PI invites group members</li>
          <li>members trust each other</li>
          <li>members share private data</li>
        </ul>
      </div>
      <div>
        <work-icon class="sm-colour-icon" />
        <h3>Project</h3>
        <ul>
          <li>organise and share data</li>
          <li>manager invites members</li>
          <li>members share private data</li>
          <li>can be linked to a publication</li>
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
import '../../components/ColourIcon.css'

import Vue from 'vue'

import TourButton from './TourButton'
import UserIcon from '../../assets/inline/refactoring-ui/user.svg'
import GroupIcon from '../../assets/inline/refactoring-ui/group.svg'
import WorkIcon from '../../assets/inline/refactoring-ui/work.svg'

import introTour from '../../tours/intro.ts'
import filteringTour from '../../tours/filtering.ts'
import diagnosticsTour from '../../tours/diagnostics.ts'

export default {
  name: 'HelpPage',
  components: {
    TourButton,
    UserIcon,
    GroupIcon,
    WorkIcon,
  },
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

<style scoped>
  h3 {
    @apply text-lg leading-9 font-medium my-0;
  }

  .column-layout {
    @apply flex flex-wrap justify-center -mx-3;
  }

  .column-layout > * {
    @apply mx-3;
    width: calc(33.333% - theme('spacing.6'));
  }

  .column-layout li + li {
    margin-top: 0;
  }

  .tours button {
    @apply mt-3;
  }

  .collaboration li:first-child {
    @apply font-medium;
  }
</style>
