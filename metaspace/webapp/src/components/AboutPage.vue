<template>
  <div class="main-content">
    <div class="mainBanner-wrapper">
      <div class="mainBanner">
        <div style="position: absolute; top: 115px; left: 334px; color: white; font-size: 30px;">Welcome to</div>
        <div style="position: absolute; top: 260px; left: 334px; color: white; font-size: 22px;">Platform for metabolite annotation of imaging mass spectrometry data</div>
      </div>
    </div>
    <div id="about">
    <el-row>
      <el-row id="threePanelHeader" style="margin:20px 0px 50px 0px" :gutter=20>
        <el-col :span=6>
          <h2>Metabolite Annotation</h2>
          <p><a href="/#/upload">Submit</a> your high-resolution imaging mass spectrometry data to our high-throughput metabolite annotation engine</p>
        </el-col>

        <el-col :span=6>
          <h2>Explore the Knowledgebase</h2>
          <p><a href="/#/annotations">Browse</a> annotations from all datasets using our interactive interface </p>
          <p>You can search, filter and compare youre annotations alongside those from the whole imaging mass spectrometry community</p>
        </el-col>

        <el-col :span=6>
          <h2>Get Going Fast</h2>
          <p>Head to the <a href="/#/upload">upload </a> page to submit a dataset. </p>
          <p> We also have interactive <a href="/#/help">tutorials</a> prepared to help you.</p>
        </el-col>

        <el-col :span=6>
          <h2>Open Access</h2>
          <p>All code is open-source, the input format is the <a
            href="http://imzml.org/">imzML</a>
            supported by all mass spec major vendors, the metabolite annotations from the community datasets are public
            and can be browsed or exported.
          </p>
        </el-col>
      </el-row>
      <el-row id="whoAreWe">
        <h2>What is the METASPACE Platform?</h2>
        <p>The METASPACE platform hosts an engine for metabolite annotation of imaging mass spectrometry data as well as a
          spatial metabolite knowledgebase of the metabolites from hundreds of public datasets provided by the
          community.</p>
        <p>The METASPACE platform is developed by software engineers, data scientists and mass spectrometrists from the <a
          href="http://www.embl.de/research/units/scb/alexandrov/">Alexandrov team at EMBL</a>. This work is a part of the
          <a href="http://project.metaspace2020.eu">European project METASPACE</a>.</p>
      </el-row>
      <el-row id="A public space">
        <h2 id="open-as-public-space">Open as public space</h2>
        <p>We do not hide anything. All code is open-source, the input format is the <a href="http://imzml.org/">imzML</a>
          supported by all mass spec major vendors, the metabolite annotations from the community datasets are public and
          can be browsed or exported.</p>
      </el-row>
      <el-row id="getInvolved">
        <h2 id="how-can-i-contribute-">How can I contribute?</h2>
        <p>Please read <a href="http://www.nature.com/nmeth/journal/v14/n1/full/nmeth.4072.html">our publication in Nature
          Methods</a>, follow us on <a href="http://twitter.com/metaspace2020">Twitter</a>, spread the word, and think of
          us while doing good deeds :)</p>
        <ul>
          <li><strong>Have high-resolution imaging mass spectrometry data</strong>? Please consider uploading them.</li>
          <li><strong>Are you a data scientist</strong>? Please feel free to the export the metabolite annotations to mine
            thousands of metabolites found in hundreds of community-provided datasets.
          </li>
        </ul>
      </el-row>
      <el-row id="citation">
        <h2 id="how-shall-i-cite-metaspace-in-a-publication-">How shall I cite METASPACE in a publication?</h2>
         <p>Please cite our publication <a
        href="http://www.nature.com/nmeth/journal/v14/n1/full/nmeth.4072.html">(Palmer et al., 2016, Nature Methods)</a>
        and
        refer to <a href="http://metaspace2020.eu">http://metaspace2020.eu</a>.</p>
      </el-row>
      <el-row id="contact">
        <h2 id="how-to-stay-in-touch-">How to stay in touch?</h2>
        <p>Follow us on <a href="http://twitter.com/metaspace2020">Twitter</a>
          or subscribe to the <a href="#" @click.prevent="onShowMailingList">METASPACE mailing list</a>.
        </p>
        <p>Find out more about the METASPACE consortium at the <a href="http://project.metaspace2020.eu/">project website</a></p>
        <p>For all other inquiries or questions, please <a href="mailto:contact@metaspace2020.eu">contact us over
          email</a>.
        </p>
      </el-row>
      <el-row id="funding">
        <h2 id="please-appreciate-those-who-funded-it">Funding</h2>
        <div style="display:flex; flex-direction: row; flex-wrap: wrap; width: 100%;">
          <div style="flex-basis: 200px; padding: 16px 0">
            <img src="../assets/eu_flag.jpg" alt="EU" style="width: 90px">
            <img src="../assets/nih_logo.png" alt="NIH" style="width: 90px">
          </div>
          <div style="flex-basis: 70%; flex-grow: 1"><p> We acknowledge funding from the
            European Union’s Horizon 2020 programme under the grant agreement 634402
            as well as from the National Institutes of Health NIDDK Kidney Precision Medicine Project.</p>
          </div>
        </div>
      </el-row>
      <el-row id="acknowledgement">
        <h2>Other acknowledgements</h2>
        <p>
          Icons by <a href="http://www.freepik.com/">Freepik</a> from <a href="www.flaticon.com">www.flaticon.com</a>
        </p>
      </el-row>
    </el-row>
    </div>
    <el-dialog
      width="600px"
      custom-class="mailing-list-dialog"
      :visible.sync="showMailingListDialog">
      <!-- Begin MailChimp Signup Form -->
      <div id="mc_embed_signup">
        <form
          action="https://metaspace2020.us18.list-manage.com/subscribe/post?u=bdddf29f72b79bb8498418e35&amp;id=ef39f45bf3"
          method="post"
          name="mc-embedded-subscribe-form"
          class="validate"
          target="_blank"
          novalidate
          @submit="onSubmitMailingList">
          <label for="mce-EMAIL">Subscribe to the METASPACE mailing list</label>
          <input type="email" value="" name="EMAIL" class="email" id="mce-EMAIL" placeholder="email address" required>
          <!-- real people should not fill this in and expect good things - do not remove this or risk form bot signups-->
          <div style="position: absolute; left: -5000px;" aria-hidden="true"><input type="text" name="b_bdddf29f72b79bb8498418e35_ef39f45bf3" tabindex="-1" value=""></div>
          <div class="clear"><input type="submit" value="Subscribe" name="subscribe" id="mc-embedded-subscribe" class="button"></div>
        </form>
      </div>
      <!--End mc_embed_signup-->
    </el-dialog>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import Component from 'vue-class-component';

  @Component
  export default class AboutPage extends Vue {
    showMailingListDialog = false;

    onShowMailingList() {
      this.showMailingListDialog = true;
    }
    onSubmitMailingList() {
      this.showMailingListDialog = false;
    }
  }
</script>

<style lang="scss">
 #about {
   display: flex;
   padding: 0px 20px;
   align-items: center;
   justify-content: center;
 }

 #about > div, #about img {
   max-width: 900px;
 }

 .mainBanner {
   position: relative;
   height: 400px;
   max-width: 1100px;
   width: 100%;
   background: url("../assets/METASPACE_banner_blue_bg.jpg") -50px;
   background-size: cover;
   margin: -8px auto 0 auto;
   /*outline: 1px solid red;*/
   box-sizing: border-box;
 }
 .mainBanner-wrapper {
   width: 100%;
   background-color: #008aff;
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
