<template>
  <div class="text-base proportional-nums leading-6">
    <div class="bg-primary overflow-hidden w-full pt-16">
      <div class="box-border font-display pt-12 pb-24 mx-auto max-w-4xl flex items-center">
        <img
          src="../../assets/METASPACE_logomark.png"
          class="hidden md:block w-66 h-66 -ml-3 lg:-ml-6 p-3 box-border"
        >
        <div class="text-white box-border ml-4 h-66">
          <h1 class="m-0 md:mt-24 flex flex-col items-start">
            <metaspace class="w-auto md:h-18 box-border py-1" />
          </h1>
          <p class="text-2xl leading-7 m-0 pt-3">
            The platform for metabolite annotation
            <br>
            of imaging mass spectrometry data
          </p>
        </div>
      </div>
    </div>
    <div
      id="about"
      class="sm-about py-12 px-18 mx-auto box-border max-w-4xl"
    >
      <section class="sm-about-features">
        <h2 class="sr-only">
          Features
        </h2>
        <div>
          <edit-icon class="sm-colour-icon" />
          <h3>Metabolite annotation</h3>
          <p>
            <router-link to="/upload">
              Submit<!--
              -->
            </router-link>
            your high-resolution imaging mass spectrometry data to our high-throughput metabolite annotation engine.
          </p>
        </div>
        <div>
          <book-icon class="sm-colour-icon" />
          <h3>Explore the knowledgebase</h3>
          <p>
            <router-link to="/annotations">
              Browse<!--
              -->
            </router-link> annotations from all datasets using our interactive interface. Search and compare your
            annotations with those from the community.
          </p>
        </div>
        <div>
          <bolt-icon class="sm-colour-icon" />
          <h3>Get going fast</h3>
          <p>
            Head to the <router-link to="/upload">
              upload<!--
              -->
            </router-link> page to submit a dataset, or try our <router-link to="/help">
              interactive tutorials<!-- -->
            </router-link> if it is your first visit and you would like to get up to speed.
          </p>
        </div>
        <div>
          <unlock-icon class="sm-colour-icon" />
          <h3>Open access</h3>
          <p>
            The <a
              href="http://imzml.org/"
            >imzML input format</a> is an open standard supported by all major mass spectrometer vendors,
            and all code is <a href="https://github.com/metaspace2020">open-source</a>.
          </p>
        </div>
      </section>
      <section class="sm-about-details max-w-measure-4 mt-12">
        <h2 class="font-display text-primary leading-12 m-0 text-base uppercase tracking-wide">
          Frequently asked questions
        </h2>
        <h3>What is the METASPACE platform?</h3>
        <p>
          The METASPACE platform hosts an engine for metabolite annotation of imaging mass spectrometry data as well as a
          spatial metabolite knowledgebase of the metabolites from thousands of public datasets provided by the
          community.
        </p>
        <p>
          The METASPACE platform is developed by software engineers, data scientists and mass spectrometrists from the <a
            href="https://www.embl.de/research/units/scb/alexandrov/"
          >Alexandrov team at EMBL</a>.
        </p>
        <h3>
          How can I contribute?
        </h3>
        <p>
          Please read <a href="https://www.nature.com/nmeth/journal/v14/n1/full/nmeth.4072.html">our publication in Nature
            Methods</a>, follow us on <a href="https://twitter.com/metaspace2020">Twitter</a>, spread the word, and think of
          us while doing good deeds :)
        </p>
        <ul>
          <li><strong>Have high-resolution imaging mass spectrometry data?</strong> Please consider uploading.</li>
          <li>
            <strong>Are you a data scientist?</strong> Please feel free to the export the metabolite annotations to mine
            thousands of metabolites found in hundreds of community-provided datasets.
          </li>
        </ul>
        <h3>
          How should I cite METASPACE?
        </h3>
        <p>
          Please cite our publication (<a
            href="http://www.nature.com/nmeth/journal/v14/n1/full/nmeth.4072.html"
          >Palmer et al., 2016, Nature Methods</a>)
          and refer to <a href="https://metaspace2020.eu">https://metaspace2020.eu</a>.
        </p>
        <h3>
          How to stay in touch?
        </h3>
        <p>
          Follow us on <a href="https://twitter.com/metaspace2020">Twitter</a> for the latest updates,
          and <a href="mailto:contact@metaspace2020.eu">contact us by email</a> for all other inquiries or questions.
        </p>
        <h3 id="please-appreciate-those-who-funded-it">
          Funding
        </h3>
        <p>
          We acknowledge funding from the following sources:
        </p>
        <ul class="sm-about-funding">
          <li>
            <img
              src="../../assets/Flag_of_Europe.svg"
              alt="EU"
            >
            <span>
              <b>European Union Horizon 2020 Programme</b>
              <br>
              under grant agreements
              <a href="https://cordis.europa.eu/project/id/634402">634402</a>,
              <a href="https://cordis.europa.eu/project/id/773089">773089</a>,
              <a href="https://cordis.europa.eu/project/id/825184">825184</a>
            </span>
          </li>
          <li>
            <img
              src="../../assets/NIDDK.svg"
              alt="NIDDK"
            >
            <span>
              <b>
                National Institutes of Health
                <abbr title="National Institute of Diabetes and Digestive and Kidney Diseases">NIDDK</abbr>
              </b>
              <br>
              Kidney Precision Medicine Project (<a href="https://kpmp.org/">kpmp.org</a>)
            </span>
          </li>
          <li>
            <img
              src="../../assets/NHLBI.svg"
              alt="NHLBI"
            >
            <span>
              <b>
                National Institutes of Health
                <abbr title="National Heart, Lung, and Blood Institute">NHLBI</abbr>
              </b>
              <br>
              LungMAP Phase 2 (<a href="https://www.lungmap.net/">lungmap.net</a>)
            </span>
          </li>
        </ul>
        <h3>Other acknowledgements</h3>
        <p>
          Icons by <a href="http://www.freepik.com/">Freepik</a> from <a href="http://www.flaticon.com">www.flaticon.com</a>,
          <a href="https://refactoringui.com/book/">Refactoring UI</a> and <a href="https://material.io/icons">Material Icons</a>.
        </p>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
import '../../components/ColourIcon.css'

import Metaspace from '../../assets/inline/METASPACE.svg'
import EditIcon from '../../assets/inline/refactoring-ui/edit.svg'
import BookIcon from '../../assets/inline/refactoring-ui/book.svg'
import BoltIcon from '../../assets/inline/refactoring-ui/bolt.svg'
import UnlockIcon from '../../assets/inline/refactoring-ui/unlock.svg'

export default {
  name: 'AboutPage',
  components: {
    Metaspace,
    EditIcon,
    BookIcon,
    BoltIcon,
    UnlockIcon,
  },
}
</script>

<style scoped>
  .sm-main-content {
    @apply mt-0 pt-0;
  }
  .sm-about h3 {
    @apply font-display font-medium leading-6 text-2xl tracking-snug py-3 m-0;
  }

  .sm-about p {
    @apply m-0 mb-6;
  }

  .sm-about ul {
    margin: 0;
    padding: 0;
  }

  .sm-about strong {
    @apply font-medium;
  }

  @screen md {
    .sm-about-features {
      @apply -mx-6 -my-6 flex flex-wrap;
    }
    .sm-about-features > div {
      @apply mx-6 my-6;
      width: calc(50% - theme('spacing.12'))
    }
    .sm-about-features p {
      @apply mb-0;
    }
  }

  .sm-about-details h3:not(:first-of-type) {
    @apply mt-12;
  }

  .sm-about-funding {
    list-style: none;
  }

  .sm-about-funding li {
    @apply flex mb-6 h-12;
  }

  .sm-about-funding img {
    @apply w-18 h-12 object-contain object-left mr-6;
  }

  .sm-about-funding b {
    @apply font-medium text-lg;
  }

  .sm-about-funding abbr[title] {
    text-decoration: none;
    cursor: help;
    border-bottom: 1px dashed currentColor;
  }
</style>
