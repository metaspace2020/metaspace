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
      class="py-12 px-18 mx-auto box-border max-w-4xl"
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
          spatial metabolite knowledgebase of the metabolites from hundreds of public datasets provided by the
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
          Follow us on <a href="https://twitter.com/metaspace2020">Twitter</a>
          or subscribe to the <a
            href="#"
            @click.prevent="onShowMailingList"
          >METASPACE mailing list</a>.
          <br>
          For all other inquiries or questions,
          <a href="https://gitter.im/metaspace2020/metaspace">chat with us on Gitter</a> or
          <a href="mailto:contact@metaspace2020.eu">contact us by email</a>.
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
              under grant agreements 634402 and 773089
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
              Kidney Precision Medicine Project
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
              LungMAP Phase 2
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
    <el-dialog
      width="600px"
      custom-class="mailing-list-dialog"
      :visible.sync="showMailingListDialog"
    >
      <!-- Begin MailChimp Signup Form -->
      <div id="mc_embed_signup">
        <form
          action="https://metaspace2020.us18.list-manage.com/subscribe/post?u=bdddf29f72b79bb8498418e35&amp;id=ef39f45bf3"
          method="post"
          name="mc-embedded-subscribe-form"
          class="validate leading-6 mt-6"
          target="_blank"
          novalidate
          @submit="onSubmitMailingList"
        >
          <div class="max-w-md">
            <label
              for="mce-EMAIL"
              class="text-base font-medium"
            >Subscribe to the METASPACE mailing list</label>
            <el-input
              id="mce-EMAIL"
              type="email"
              value=""
              name="EMAIL"
              class="email py-1"
              placeholder="email address"
              required
            />
            <!-- real people should not fill this in and expect good things - do not remove this or risk form bot signups-->
            <div
              style="position: absolute; left: -5000px;"
              aria-hidden="true"
            >
              <input
                type="text"
                name="b_bdddf29f72b79bb8498418e35_ef39f45bf3"
                tabindex="-1"
                value=""
              >
            </div>
            <div class="clear mt-3">
              <input
                id="mc-embedded-subscribe"
                type="submit"
                value="Subscribe"
                name="subscribe"
                class="button el-button el-button--primary"
              >
            </div>
          </div>
        </form>
      </div>
      <!--End mc_embed_signup-->
    </el-dialog>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import Component from 'vue-class-component'

import Metaspace from '../../assets/inline/METASPACE.svg'
import EditIcon from '../../assets/inline/refactoring-ui/edit.svg'
import BookIcon from '../../assets/inline/refactoring-ui/book.svg'
import BoltIcon from '../../assets/inline/refactoring-ui/bolt.svg'
import UnlockIcon from '../../assets/inline/refactoring-ui/unlock.svg'

@Component({
  components: {
    Metaspace,
    EditIcon,
    BookIcon,
    BoltIcon,
    UnlockIcon,
  },
})
export default class AboutPage extends Vue {
    showMailingListDialog = false;

    onShowMailingList() {
      this.showMailingListDialog = true
    }

    onSubmitMailingList() {
      this.showMailingListDialog = false
    }
}
</script>

<style scoped>
  .sm-main-content {
    @apply mt-0 pt-0;
  }
</style>
<style>
  @import "../../components/ColourIcon.css";

  #about h3 {
    @apply font-display font-medium leading-6 text-2xl tracking-snug py-3 m-0;
  }

  #about p {
    @apply m-0 mb-6;
  }

  #about ul {
    margin: 0;
    padding: 0;
  }

  #about strong {
    @apply font-medium;
  }

  @screen md {
    #about .sm-about-features {
      @apply -mx-6 -my-6 flex flex-wrap;
    }
    #about .sm-about-features > div {
      @apply mx-6 my-6;
      width: calc(50% - theme('spacing.12'))
    }
    #about .sm-about-features p {
      @apply mb-0;
    }
  }

  #about .sm-about-details h3:not(:first-of-type) {
    @apply mt-12;
  }

  #about .sm-about-funding {
    list-style: none;
  }

  #about .sm-about-funding li {
    @apply flex mb-6 h-12;
  }

  #about .sm-about-funding img {
    @apply w-18 h-12 object-contain object-left mr-6;
  }

  #about .sm-about-funding b {
    @apply font-medium text-lg;
  }

  #about .sm-about-funding abbr[title] {
    text-decoration: none;
    cursor: help;
    border-bottom: 1px dashed currentColor;
  }

  .mailing-list-dialog .el-dialog__body {
    padding-top: 0;
  }
  /* MailChimp Form Embed Code - converted from http://cdn-images.mailchimp.com/embedcode/horizontal-slim-10_7.css */
  #mc_embed_signup {
    background:#fff;
    clear:left;
    width:100%;

    form {text-align:center; padding:10px 0 10px 0;}
    label {display:block; font-size:16px; padding-bottom:10px; font-weight:bold;}
    .clear {display: inline-block;} /* positions button horizontally in line with input */
    .button {font-size: 13px; border: none; -webkit-border-radius: 3px; -moz-border-radius: 3px; border-radius: 3px; letter-spacing: .03em; color: #fff; background-color: #aaa; box-sizing:border-box; height:32px; line-height:32px; padding:0 18px; display: inline-block; margin: 0; transition: all 0.23s ease-in-out 0s;}
    .button:hover {background-color:#777; cursor:pointer;}
    div.response {margin:1em 0; padding:1em .5em .5em 0; font-weight:bold; float:left; top:-1.5em; z-index:1; width:80%;}
    label.error {display:block; float:none; width:auto; margin-left:1.05em; text-align:left; padding:.5em 0;}
    @media (max-width: 768px) {
      .clear {display: block; width: 100% }
      .button {width: 100%; margin:0; }
    }
  }
</style>
