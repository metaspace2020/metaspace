<template>
  <div class="main-content">
    <div class="mainBanner-wrapper">
      <div class="mainBanner">
        <div style="position: absolute; top: 100px; left: 330px; color: white; font-size: 32px; line-height: 40px; margin: 10px 0">
          Welcome to
        </div>
        <img
          src="../../assets/METASPACE_banner.jpg"
          alt="METASPACE"
        >
        <div style="position: absolute; top: 260px; left: 330px; color: white; font-size: 24px; line-height: 30px; min-width: 40ch">
          The platform for metabolite annotation
          <br>
          of imaging mass spectrometry data.
        </div>
      </div>
    </div>
    <div id="about">
      <section class="about-features">
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          ><path
            class="primary"
            d="M4 14a1 1 0 0 1 .3-.7l11-11a1 1 0 0 1 1.4 0l3 3a1 1 0 0 1 0 1.4l-11 11a1 1 0 0 1-.7.3H5a1 1 0 0 1-1-1v-3z"
          /><rect
            width="20"
            height="2"
            x="2"
            y="20"
            class="secondary"
            rx="1"
          /></svg>
          <h2>Metabolite annotation</h2>
          <p>
            <router-link to="/upload">
              Submit
            </router-link>
            your high-resolution imaging mass spectrometry data to our high-throughput metabolite annotation engine
          </p>
        </div>
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          ><path
            class="primary"
            d="M13.41 20.41a2 2 0 0 1-2.82 0l-.83-.82A2 2 0 0 0 8.34 19H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4a5 5 0 0 1 4 2 5 5 0 0 1 4-2h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4.34a2 2 0 0 0-1.42.59l-.83.82z"
          /><path
            class="secondary"
            d="M12 21V5a5 5 0 0 1 4-2h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4.34a2 2 0 0 0-1.42.59l-.83.82A2 2 0 0 1 12 21z"
          /></svg>
          <h2>Explore the knowledgebase</h2>
          <p>
            <router-link to="/annotations">
              Browse
            </router-link> annotations from all datasets using our interactive interface. Search, filter and compare your annotations with those from the community.
          </p>
        </div>
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            class="w-8 mr-4 icon-bolt"
          ><circle
            cx="12"
            cy="12"
            r="10"
            class="primary"
          /><path
            class="secondary"
            d="M14 10h2a1 1 0 0 1 .81 1.58l-5 7A1 1 0 0 1 10 18v-4H8a1 1 0 0 1-.81-1.58l5-7A1 1 0 0 1 14 6v4z"
          /></svg>
          <h2>Get going fast</h2>
          <p>
            Head to the <router-link to="/upload">
              upload
            </router-link> page to submit a dataset. We also have interactive <router-link to="/help">
              tutorials.
            </router-link>
          </p>
        </div>
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          ><path
            class="primary"
            d="M11 16.73V18a1 1 0 0 0 2 0v-1.27a2 2 0 1 0-2 0zM5 10h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8c0-1.1.9-2 2-2z"
          /><path
            class="secondary"
            d="M12 19a1 1 0 0 0 1-1v-1.27A2 2 0 0 0 12 13v-3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7v-3zm5-12a1 1 0 0 1-2 0 3 3 0 0 0-6 0v3H7V7a5 5 0 1 1 10 0z"
          /></svg>
          <h2>Open access</h2>
          <p>
            All code is <a href="https://github.com/metaspace2020">open-source</a>, the input format is the <a
              href="http://imzml.org/"
            >imzML</a>
            supported by all mass spec major vendors, the metabolite annotations from the community datasets are public
            and can be browsed or exported.
          </p>
        </div>
      </section>
      <section class="about-details">
        <h1>Frequently asked questions</h1>
        <h2>What is the METASPACE platform?</h2>
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
        <h2>
          How can I contribute?
        </h2>
        <p>
          Please read <a href="https://www.nature.com/nmeth/journal/v14/n1/full/nmeth.4072.html">our publication in Nature
            Methods</a>, follow us on <a href="https://twitter.com/metaspace2020">Twitter</a>, spread the word, and think of
          us while doing good deeds :)
        </p>
        <ul>
          <li><strong>Have high-resolution imaging mass spectrometry data</strong>? Please consider uploading.</li>
          <li>
            <strong>Are you a data scientist</strong>? Please feel free to the export the metabolite annotations to mine
            thousands of metabolites found in hundreds of community-provided datasets.
          </li>
        </ul>
        <h2>
          How shall I cite METASPACE in a publication?
        </h2>
        <p>
          Please cite our publication <a
            href="http://www.nature.com/nmeth/journal/v14/n1/full/nmeth.4072.html"
          >(Palmer et al., 2016, Nature Methods)</a>
          and
          refer to <a href="https://metaspace2020.eu">https://metaspace2020.eu</a>.
        </p>
        <h2>
          How to stay in touch?
        </h2>
        <p>
          Follow us on <a href="https://twitter.com/metaspace2020">Twitter</a>
          or subscribe to the <a
            href="#"
            @click.prevent="onShowMailingList"
          >METASPACE mailing list</a>.
        </p>
        <!-- <p>Find out more about the METASPACE consortium at the <a href="http://project.metaspace2020.eu/">project website</a></p> -->
        <p>
          For all other inquiries or questions,
          <a href="https://gitter.im/metaspace2020/metaspace">chat with us on Gitter</a> or
          <a href="mailto:contact@metaspace2020.eu">contact us by email</a>.
        </p>
        <h2 id="please-appreciate-those-who-funded-it">
          Funding
        </h2>
        <div style="margin: 0 0 20px; height: 60px">
          <img
            src="../../assets/eu_flag.jpg"
            alt="EU"
            style="width: auto; height: 60px;"
          >
          <img
            src="../../assets/nih_logo.png"
            alt="NIH"
            style="width: auto; height: 60px; margin-left: 10px"
          >
        </div>
        <p>
          We acknowledge funding from the
          European Union’s Horizon 2020 programme under the grant agreement 634402
          as well as from the National Institutes of Health NIDDK Kidney Precision Medicine Project.
        </p>
        <h2>Other acknowledgements</h2>
        <p>
          Icons by <a href="http://www.freepik.com/">Freepik</a> from <a href="http://www.flaticon.com">www.flaticon.com</a>
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
          class="validate"
          target="_blank"
          novalidate
          @submit="onSubmitMailingList"
        >
          <label for="mce-EMAIL">Subscribe to the METASPACE mailing list</label>
          <input
            id="mce-EMAIL"
            type="email"
            value=""
            name="EMAIL"
            class="email"
            placeholder="email address"
            required
          >
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
          <div class="clear">
            <input
              id="mc-embedded-subscribe"
              type="submit"
              value="Subscribe"
              name="subscribe"
              class="button"
            >
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

  @Component
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

<style lang="scss">
  @font-face {
    font-family: "FuturaBT-Medium";
    src: url("../../assets/fonts/futura/2FD17E_0_0.eot");
    src: url("../../assets/fonts/futura/2FD17E_0_0.eot?#iefix") format("embedded-opentype"), url("../../assets/fonts/futura/2FD17E_0_0.woff2") format("woff2"), url("../../assets/fonts/futura/2FD17E_0_0.woff") format("woff"), url("../../assets/fonts/futura/2FD17E_0_0.ttf") format("truetype");
    font-style: normal;
    font-weight: normal;
  }
  @font-face {
    font-family: "ProximaNova-Light";
    src: url("../../assets/fonts/proximaNova/2FD17E_3_0.eot?#iefix") format("embedded-opentype"), url("../../assets/fonts/proximaNova/2FD17E_3_0.woff2") format("woff2"), url("../../assets/fonts/proximaNova/2FD17E_3_0.woff") format("woff"), url("../../assets/fonts/proximaNova/2FD17E_3_0.ttf") format("truetype");
    src: url("../../assets/fonts/proximaNova/2FD17E_3_0.eot");
    font-style: normal;
    font-weight: normal;
  }

  // .baseline-grid {
  //   background-image: linear-gradient(180deg,red 1px,transparent 0);
  //   background-position: 0 0;
  //   background-repeat: repeat;
  //   background-size: 100% 20px;
  // }

  .main-content {
    line-height: 20px;
  }

  .mainBanner {
    box-sizing: border-box;
    font-family: 'FuturaBT-Medium', 'Roboto', Helvetica, sans-serif;
    height: 400px;
    margin: 0 auto;
    max-width: 1100px;
    position: relative;
  }
  .mainBanner-wrapper {
    background-color: #008aff;
    overflow: hidden;
    width: 100%;
  }
  .mainBanner img {
    // max-width: 100%;
    margin-top: 40px;
    margin-left: -30px;
    // position: relative;
    // z-index: -1;
  }

  #about {
    color: rgb(30, 47, 70);
    font-family: 'ProximaNova-Light', 'Roboto', Helvetica, sans-serif;
    margin: 40px auto;
    max-width: 960px;
    padding: 0px 40px;
  }

  #about h1 {
    font-family: 'FuturaBT-Medium', 'Roboto', Helvetica, sans-serif;
    line-height: 20px;
    font-size: 16px;
    text-transform: uppercase;
    color: #008aff;
    margin: 20px 0;
  }

  #about h2 {
    font-family: 'FuturaBT-Medium', 'Roboto', Helvetica, sans-serif;
    margin: 0;
    line-height: 40px;
  }

  #about p {
    margin: 0 0 20px;
  }

  #about a {
    color: #008aff;
  }

  #about ul {
    margin: 0;
    padding: 0;
  }

  #about li {
    margin-bottom: 20px;
  }

  #about svg {
    width: 32px;
    height: 32px;
    padding: 14px;
    border-radius: 50%;
    background-color: hsl(208, 100%, 94%);
  }

  #about svg .primary {
    fill: hsl(208, 77%, 34%);
  }

  #about svg .secondary {
    fill: hsl(208, 80%, 74%);
  }

  .about-features {
    display: grid;
    grid-gap: 20px;
    grid-template-columns: 100%;
    margin-top: 20px;
  }

  .about-details {
    max-width: 70ch;
    margin-top: 40px;
    margin-left: auto;
    margin-right: auto;
  }

  #about .about-details h2:not(:first-of-type) {
    margin-top: 40px;
  }

  @media (min-width: 400px) {
    .about-features {
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    }
    .about-features p {
      max-width: 40ch;
    }
  }

  .mailing-list-dialog .el-dialog__body {
    padding-top: 0;
  }
  /* MailChimp Form Embed Code - converted from http://cdn-images.mailchimp.com/embedcode/horizontal-slim-10_7.css */
  #mc_embed_signup {
    background:#fff;
    clear:left;
    font:14px Helvetica,Arial,sans-serif;
    width:100%;

    form {text-align:center; padding:10px 0 10px 0;}
    input.email {font-family:"Open Sans","Helvetica Neue",Arial,Helvetica,Verdana,sans-serif; font-size: 15px; border: 1px solid #ABB0B2;  -webkit-border-radius: 3px; -moz-border-radius: 3px; border-radius: 3px; color: #343434; background-color: #fff; box-sizing:border-box; height:32px; padding: 0px 0.4em; display: inline-block; margin: 0; width:350px; vertical-align:top;}
    label {display:block; font-size:16px; padding-bottom:10px; font-weight:bold;}
    .clear {display: inline-block;} /* positions button horizontally in line with input */
    .button {font-size: 13px; border: none; -webkit-border-radius: 3px; -moz-border-radius: 3px; border-radius: 3px; letter-spacing: .03em; color: #fff; background-color: #aaa; box-sizing:border-box; height:32px; line-height:32px; padding:0 18px; display: inline-block; margin: 0; transition: all 0.23s ease-in-out 0s;}
    .button:hover {background-color:#777; cursor:pointer;}
    div.response {margin:1em 0; padding:1em .5em .5em 0; font-weight:bold; float:left; top:-1.5em; z-index:1; width:80%;}
    label.error {display:block; float:none; width:auto; margin-left:1.05em; text-align:left; padding:.5em 0;}
    @media (max-width: 768px) {
      input.email {width:100%; margin-bottom:5px;}
      .clear {display: block; width: 100% }
      .button {width: 100%; margin:0; }
    }
  }
</style>
