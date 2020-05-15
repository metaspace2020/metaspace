<template>
  <div class="text-lg proportional-nums leading-7">
    <div class="bg-primary overflow-hidden w-full -mt-2 pb-7 sm-banner-gradient">
      <div class="box-border font-display py-14 mx-auto max-w-4xl flex items-center _baseline-grid-28">
        <img
          src="../../assets/METASPACE_logomark.png"
          class="hidden md:block w-77 h-77 -ml-14 p-3.5 box-border"
        >
        <div class="text-white box-border ml-7 h-77">
          <h1 class="m-0 md:mt-21 flex flex-col items-start">
            <span class="text-3xl leading-7">Welcome to</span>
            <metaspace class="w-auto md:h-21 py-1.75 box-border" />
          </h1>
          <p class="text-2xl leading-7 m-0 py-3.5">
            The platform for metabolite annotation
            <br>
            of imaging mass spectrometry data
          </p>
        </div>
      </div>
    </div>
    <div
      id="about"
      class="p-14 mx-auto box-border max-w-4xl _baseline-grid-28"
    >
      <section class="sm-about-features">
        <h2 class="sr-only">
          Features
        </h2>
        <div>
          <edit-icon />
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
          <book-icon />
          <h3>Explore the knowledgebase</h3>
          <p>
            <router-link to="/annotations">
              Browse<!--
              -->
            </router-link> annotations from all datasets using our interactive interface. Search and compare your annotations with those from the community.
          </p>
        </div>
        <div>
          <bolt-icon />
          <h3>Get going fast</h3>
          <p>
            Head to the <router-link to="/upload">
              upload<!--
              -->
            </router-link> page to submit a dataset. Try our <router-link to="/help">
              interactive tutorials<!-- -->
            </router-link> if it is your first time and you would like to get up to speed.
          </p>
        </div>
        <div>
          <unlock-icon />
          <h3>Open access</h3>
          <p>
            All code is <a href="https://github.com/metaspace2020">open-source</a> and the <a
              href="http://imzml.org/"
            >imzML input format</a> is open and supported by all major mass spectrometer vendors.
          </p>
        </div>
      </section>
      <section class="sm-about-details max-w-measure-4 mt-14">
        <h2 class="font-display text-primary leading-14 m-0 text-lg uppercase tracking-wide">
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
    <footer class="bg-gray-100 border-0 border-t border-solid border-gray-400 sm-about-footer">
      <div class="max-w-4xl mx-auto p-14 box-border text-gray-800 text-base text-center">
        <p class="flex justify-center m-0 font-medium">
          <a href="#">Terms of service</a>
          <a href="#">Privacy policy</a>
          <a href="mailto:contact@metaspace2020.eu">Contact us</a>
          <a href="https://twitter.com/metaspace2020">Follow us on Twitter</a>
        </p>
        <p class="m-0 mt-7">
          &copy; 2020 Alexandrov Team
        </p>
      </div>
    </footer>
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
            <!-- <input
              id="mce-EMAIL"
              type="email"
              value=""
              name="EMAIL"
              class="email"
              placeholder="email address"
              required
            > -->

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

import Metaspace from '../../assets/METASPACE.svg?inline'
import EditIcon from '../../assets/icons/refactoring-ui-edit.svg?inline'
import BookIcon from '../../assets/icons/refactoring-ui-book.svg?inline'
import BoltIcon from '../../assets/icons/refactoring-ui-bolt.svg?inline'
import UnlockIcon from '../../assets/icons/refactoring-ui-unlock.svg?inline'

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

<style>
  .sm-banner-gradient {
    background-image: linear-gradient(
      to right,
      theme('colors.primary'),
      theme('colors.primary'),
      theme('colors.primary'),
      theme('colors.blue.300')
    );
  }

  /* #about h2, */
  #about h3 {
    @apply font-display font-medium leading-14 text-3xl m-0;
  }

  #about p {
    @apply m-0 mb-7;
  }

  #about ul {
    margin: 0;
    padding: 0;
  }

  #about strong {
    @apply font-medium;
  }

  #about svg .primary {
    fill: theme('colors.blue.800');
  }

  #about svg .secondary {
    fill: theme('colors.blue.300');
  }

  #about .sm-about-features svg {
    @apply block rounded-full bg-blue-100 w-12 h-12 p-2 box-border mb-2;
  }

  #about .sm-about-details h3:not(:first-of-type) {
    @apply mt-14;
  }

  @screen md {
    #about .sm-about-features {
      @apply -mx-3.5 -my-7 flex flex-wrap;
    }
    #about .sm-about-features > div {
      @apply mx-3.5 my-7;
      width: calc(50% - theme('spacing.7'))
    }
    #about .sm-about-features p {
      margin-bottom: 0;
    }
  }

  #about .sm-about-funding {
    list-style: none;
  }

  #about .sm-about-funding li {
    @apply flex mb-7;
  }

  #about .sm-about-funding img {
    @apply w-21 h-14 object-contain object-left mr-7;
  }

  #about .sm-about-funding b {
    @apply font-medium text-xl;
  }

  #about .sm-about-funding abbr[title] {
    text-decoration: none;
    cursor: help;
    border-bottom: 1px dashed currentColor;
  }

  #about + footer a {
    @apply mx-7;
    color: inherit;
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
