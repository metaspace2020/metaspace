<template>
  <div class="main-content">
    <div class="mainBanner-wrapper">
      <div class="mainBanner _baseline-grid">
        <img
          src="../../assets/METASPACE_logomark.jpg"
          alt="METASPACE logo"
        >
        <h1>
          <span>Welcome to</span>
          <br>
          <svg
            viewBox="0 0 2060 256"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1952.29 157.633H2040.99V103.124H1952.29V67.7929H2056.56V9.45909H1890.62V251.154H2059.89V192.814H1952.29V157.633ZM1525.27 174.766L1501.48 125.962L1478.67 174.766H1525.27ZM1502.69 0.547791L1633.63 251.154H1562.52L1547.18 219.7H1457.68L1442.98 251.154H1374.57L1502.69 0.547791ZM1092.07 106.14C1070.9 96.3808 1057.92 89.7504 1057.92 76.9667C1057.92 68.722 1065.09 63.7997 1077.09 63.7997C1097.1 63.7997 1112.08 84.6365 1112.08 84.6365L1145.61 37.497C1145.61 37.497 1121.32 5.45755 1072.42 5.45755C1020.23 5.45755 992.913 41.4298 992.913 76.9667C992.913 124.383 1028.78 141.708 1057.6 155.629C1075.85 164.445 1090.26 171.406 1090.26 182.98C1090.26 191.772 1083.76 196.815 1072.42 196.815C1043.72 196.815 1023.26 166.407 1023.26 166.407L984.224 214.042C984.224 214.042 1010.27 255.155 1071.09 255.155C1119.87 255.155 1155.27 224.52 1155.27 182.313C1155.27 135.28 1120.23 119.121 1092.07 106.14ZM1323.22 90.6357C1323.22 78.2707 1313.16 68.2095 1300.79 68.2095H1273.99V113.062H1300.79C1313.16 113.062 1323.22 103.001 1323.22 90.6357ZM1386.35 91.2898C1386.35 135.623 1350.14 173.075 1307.29 173.075H1273.99V251.41H1212.32V9.60909H1307.29C1350.14 9.60909 1386.35 47.0145 1386.35 91.2898ZM861.518 174.766L837.72 125.962L814.918 174.766H861.518ZM838.936 0.547791L969.872 251.154H898.768L883.43 219.7H793.924L779.228 251.154H710.811L838.936 0.547791ZM1767.86 196.815C1728.7 196.815 1701.35 169.467 1701.35 130.31C1701.35 89.9066 1725.36 63.7997 1762.53 63.7997C1798.86 63.7997 1808.93 82.6347 1808.93 82.6347L1841.22 36.6513C1841.22 36.6513 1815.44 5.45755 1762.53 5.45755C1685.87 5.45755 1636.34 54.4656 1636.34 130.31C1636.34 204.985 1687.19 255.155 1762.86 255.155C1812.06 255.155 1847.47 223.085 1847.47 223.085L1818.31 174.262C1818.31 174.262 1798.17 196.815 1767.86 196.815ZM727.831 9.45909H526.131V67.7929H596.141V251.154H657.817V67.7929H727.831V9.45909ZM374.544 157.633H463.242V103.124H374.544V67.7929H478.809V9.45909H312.869V251.154H482.144V192.814H374.544V157.633ZM121.283 95.0039L239.174 0.970657V251.154H177.501V129.943L121.381 174.583L61.8099 129.366V251.154H0.134644V1.1248L121.283 95.0039Z"
              fill="white"
            />
            <text>METASPACE</text>
          </svg>
          <br>
          <span>
            The platform for metabolite annotation
            <br>
            of imaging mass spectrometry data.
          </span>
        </h1>
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
          <br>
          For all other inquiries or questions,
          <a href="https://gitter.im/metaspace2020/metaspace">chat with us on Gitter</a> or
          <a href="mailto:contact@metaspace2020.eu">contact us by email</a>.
        </p>
        <h2 id="please-appreciate-those-who-funded-it">
          Funding
        </h2>
        <div class="funding-logos">
          <img
            src="../../assets/eu_flag.jpg"
            alt="EU"
          >
          <img
            src="../../assets/nih_logo.png"
            alt="NIH"
          >
        </div>
        <p>
          We acknowledge funding from the
          European Union’s Horizon 2020 programme under grant agreement 634402,
          and from the National Institutes of Health NIDDK Kidney Precision Medicine Project.
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
    src: url("../../assets/fonts/proximaNova/2FD17E_3_0.eot");
    src: url("../../assets/fonts/proximaNova/2FD17E_3_0.eot?#iefix") format("embedded-opentype"), url("../../assets/fonts/proximaNova/2FD17E_3_0.woff2") format("woff2"), url("../../assets/fonts/proximaNova/2FD17E_3_0.woff") format("woff"), url("../../assets/fonts/proximaNova/2FD17E_3_0.ttf") format("truetype");
    font-style: normal;
    font-weight: normal;
  }

  .baseline-grid {
    background-image: linear-gradient(180deg,red 1px,transparent 0);
    background-position: 0 0;
    background-repeat: repeat;
    background-size: 100% var(--lineHeight);
  }

  .main-content {
    --lineHeight: 24px;
    line-height: var(--lineHeight);
    font-size: 18px;
  }

  .mainBanner {
    box-sizing: border-box;
    font-family: 'FuturaBT-Medium', 'Roboto', Helvetica, sans-serif;
    height: calc(var(--lineHeight) * 20);
    margin: 0 auto;
    max-width: 1100px;
    position: relative;
    display: flex;
    align-items: center;
  }
  .mainBanner-wrapper {
    background-color: #008aff;
    overflow: hidden;
    width: 100%;
  }
  .mainBanner img {
    display: none;
    @media (min-width: 1100px) {
      display: block;
      height: calc(var(--lineHeight) * 12);
    }
  }

  .mainBanner h1 {
    color: #fff;
    height: calc(var(--lineHeight) * 10);
    box-sizing: border-box;
    margin: 0;
    padding-left: calc(var(--lineHeight) * 2);
    @media (min-width: 1100px) {
      padding-top: var(--lineHeight);
    }
  }
  .mainBanner h1 > :first-child {
    font-size: 32px;
    line-height: calc(var(--lineHeight) * 2);
  }
  .mainBanner svg {
    width: auto;
    height: calc(var(--lineHeight) * 4)
  }
  .mainBanner h1 > :last-child {
    font-size: 24px;
    line-height: calc(var(--lineHeight) * 1.25);
    margin: calc(var(--lineHeight) / 2) 0 0;
    display: block;
  }

  #about {
    color: rgb(30, 47, 70);
    font-family: 'ProximaNova-Light', 'Roboto', Helvetica, sans-serif;
    margin: calc(var(--lineHeight) * 2) auto;
    max-width: 960px;
    padding: 0px calc(var(--lineHeight) * 2);
  }

  #about h1 {
    font-family: 'FuturaBT-Medium', 'Roboto', Helvetica, sans-serif;
    line-height: inherit;
    font-size: inherit;
    text-transform: uppercase;
    color: #008aff;
    margin: var(--lineHeight) 0;
  }

  #about h2 {
    font-family: 'FuturaBT-Medium', 'Roboto', Helvetica, sans-serif;
    margin: 0;
    line-height: calc(var(--lineHeight) * 2)
  }

  #about p {
    margin: 0 0 var(--lineHeight);
  }

  #about a {
    color: #008aff;
  }

  #about ul {
    margin: 0;
    padding: 0;
  }

  #about li {
    margin-bottom: var(--lineHeight);
  }

  #about svg .primary {
    fill: hsl(208, 77%, 34%);
  }

  #about svg .secondary {
    fill: hsl(208, 80%, 74%);
  }

  #about .about-features {
    display: grid;
    grid-gap: var(--lineHeight);
    grid-template-columns: 100%;
    margin-top: var(--lineHeight);
  }

  #about .about-features svg {
    display: block;
    width: 32px;
    height: 32px;
    padding: 8px;
    border-radius: 50%;
    background-color: hsl(208, 100%, 94%);
    margin: calc(var(--lineHeight) / 2) 0;
  }

  #about .about-details {
    max-width: 70ch;
    margin-top: calc(var(--lineHeight) * 2);
    // margin-left: auto;
    // margin-right: auto;
  }

  #about .about-details h2:not(:first-of-type) {
    margin-top: calc(var(--lineHeight) * 2);
  }

  @media (min-width: 400px) {
    #about .about-features {
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    }
    #about .about-features p {
      max-width: 40ch;
      margin-bottom: 0;
    }
  }

  #about .funding-logos {
    height: calc(var(--lineHeight) * 3);
  }

  #about .funding-logos img {
    width: auto;
    height: calc(var(--lineHeight) * 2.5);
    margin: calc(var(--lineHeight) * .25) 0
  }

  #about .funding-logos img + img {
    margin-left: calc(var(--lineHeight) * .25);
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
