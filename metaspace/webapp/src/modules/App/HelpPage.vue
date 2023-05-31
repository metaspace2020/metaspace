<template>
  <content-page>
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
    <h2>API documentation</h2>
    <p>
      Check our
      <a href="https://metaspace2020.readthedocs.io/en/latest/">Python package</a>, which
      provides programmatic access to the METASPACE platform.
    </p>
    <h2 id="databases">
      Metabolite Databases
    </h2>
    <database-help />
    <h2>Collaboration</h2>
    <p>Share your data with others in the following ways:</p>
    <div
      class="collaboration column-layout"
    >
      <div>
        <primary-icon class="mb-2">
          <user-svg />
        </primary-icon>
        <h3>User</h3>
        <ul>
          <li>owner of their data</li>
          <li>can make their data public</li>
          <li>can edit dataset</li>
          <li>can delete their data</li>
        </ul>
      </div>
      <div>
        <primary-icon class="mb-2">
          <group-svg />
        </primary-icon>
        <h3>Group</h3>
        <ul>
          <li>users from same lab</li>
          <li>PI invites group members</li>
          <li>members trust each other</li>
          <li>members share private data</li>
        </ul>
      </div>
      <div>
        <primary-icon
          class="mb-2"
          inverse
        >
          <work-svg />
        </primary-icon>
        <h3>Project</h3>
        <ul>
          <li>organise and share data</li>
          <li>manager invites members</li>
          <li>members share private data</li>
          <li>can be linked to a publication</li>
        </ul>
      </div>
    </div>
    <h2 id="publishing">
      Scientific publishing
    </h2>
    <p>
      We provide a workflow to allow datasets to be peer-reviewed and published directly in METASPACE.
      After creating a <router-link to="/projects">
        project<!-- -->
      </router-link>, follow the steps on the <em>Publishing</em> tab:
    </p>
    <ol class="sm-ordered-list p-0 max-w-measure-4">
      <li>
        Create a <b>short link</b> to the project to be used in the manuscript, and add an abstract to the project
        description to provide context for the results.
      </li>
      <li>
        Use a <b>review link</b> to give reviewers access to the project without making the data public.
        This protects sensitive discoveries and can be revoked at any time.
      </li>
      <li>
        After the paper has been published, add the <b>DOI</b> and make the results available to all.
      </li>
    </ol>
    <h2>Feedback</h2>
    <p>
      Please send feedback to <a href="mailto:contact@metaspace2020.eu">our e-mail address</a>.
    </p>
  </content-page>
</template>
<script>
import { defineComponent } from '@vue/composition-api'

import TourButton from './TourButton'
import PrimaryIcon from '../../components/PrimaryIcon.vue'
import ContentPage from '../../components/ContentPage.vue'

import UserSvg from '../../assets/inline/refactoring-ui/icon-user.svg'
import GroupSvg from '../../assets/inline/refactoring-ui/icon-user-group.svg'
import WorkSvg from '../../assets/inline/refactoring-ui/icon-work.svg'

import introTour from '../../tours/intro.ts'
import filteringTour from '../../tours/filtering.ts'
import diagnosticsTour from '../../tours/diagnostics.ts'

import DatabaseHelp from './DatabaseHelp'

import useAnchorLinkHack from '../../lib/useAnchorLinkHack'

export default defineComponent({
  name: 'HelpPage',
  components: {
    TourButton,
    PrimaryIcon,
    ContentPage,
    UserSvg,
    GroupSvg,
    WorkSvg,
    DatabaseHelp,
  },
  setup(_, { root }) {
    useAnchorLinkHack()
    return {
      intro() {
        root.$store.commit('startTour', introTour)
      },
      filtering() {
        root.$store.commit('startTour', filteringTour)
      },
      diagnostics() {
        root.$store.commit('startTour', diagnosticsTour)
      },
    }
  },
})
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
