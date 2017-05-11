<template>
  <div class="b-header">
    <div>
      <div class="header-item" id="metasp-logo">
        <router-link to="/" style="display: flex">
          <img src="../assets/logo.png"
              alt="Metaspace" title="Metaspace"
              style="border: 0px;"
              class="vc"></img>
        </router-link>
      </div>

      <router-link to="/upload">
        <div class="header-item vc page-link" id='upload-link'>
          <div class="vc">Upload</div>
        </div>
      </router-link>

      <router-link :to="datasetsHref">
        <div class="header-item vc page-link" id='datasets-link'>
          <div class="vc">Datasets</div>
        </div>
      </router-link>

      <router-link :to="annotationsHref">
        <div class="header-item vc page-link" id='annotations-link'>
          <div class="vc">Annotations</div>
        </div>
      </router-link>

      <router-link to="/about">
        <div class="header-item vc page-link">
          <div class="vc">About</div>
        </div>
      </router-link>

      <router-link to="/help">
        <div class="header-item vc page-link">
          <div class="vc">Help</div>
        </div>
      </router-link>
    </div>

    <el-popover ref="login-popover"
                placement="bottom"
                trigger="click"
                style="text-align:center;">
      <div id="email-link-container">
        <el-button type="primary" @click="sendLoginLink">Send a link to</el-button>
        <span>
          <el-input v-model="loginEmail"
                    placeholder="e-mail address">
          </el-input>
        </span>
      </div>

      <div style="text-align: center;">
        <div style="margin: 10px; font-size: 18px;">or</div>
        <a href="/auth/google">
          <el-button>Sign in with Google</el-button>
        </a>
      </div>
    </el-popover>

    <div v-show="!this.$store.state.authenticated"
         class="header-item vc page-link" v-popover:login-popover>
      <div class="vc">Sign in</div>
    </div>

    <div v-show="this.$store.state.authenticated">
      <div class="header-item vc">
        <div class="vc" style="color: white;">
          {{ userNameOrEmail }}
        </div>
      </div>
      <div class="header-item vc page-link" @click="logout">
        <div class="vc">Sign out</div>
      </div>
    </div>
  </div>
</template>

<script>
 import FILTER_SPECIFICATIONS from '../filterSpecs.js';
 import {encodeParams, DEFAULT_FILTER} from '../url.js';
 import {getJWT, decodePayload} from '../util.js';
 import fetch from 'isomorphic-fetch';

 export default {
   name: 'metaspace-header',

   computed: {
     datasetsHref() {
       return this.href('/datasets');
     },

     annotationsHref() {
       return this.href('/annotations');
     },

     userNameOrEmail() {
       const {user} = this.$store.state;
       if (!user)
         return '';
       return user.name || user.email;
     }
   },

   data() {
     return {
       loginEmail: (this.$store.state.user ? this.$store.state.user.email : '')
     };
   },

   mounted() {
     this.login();
   },

   methods: {
     href(path) {
       const lastParams = this.$store.state.lastUsedFilters[path];
       let f = lastParams ? lastParams.filter : {}
       f = Object.assign({}, DEFAULT_FILTER, f, this.$store.getters.filter)
       const link = {
         path,
         query: encodeParams(f, path)
       };
       return link;
     },

     sendLoginLink() {
       fetch('/sendToken?user=' + this.loginEmail)
         .then((res) => {
           if (res.ok)
             this.$notify({
               title: 'Check your mailbox!',
               type: 'success',
               message: "We've sent you an e-mail with the link to log in"
             });
           else
             this.$notify({
               title: 'Error ' + res.status,
               type: 'error',
               message: res.statusText
             });
         });
     },

     login() {
       getJWT().then(jwt => {
         const {name, email, role} = decodePayload(jwt);
         if (role != 'anonymous') {
           this.$store.commit('login', {name, email, role});
           console.log(`Signed in as ${name} (role: ${role})`);
         }
       }).catch(err => console.log(err))
     },

     logout() {
       console.log('logout');
       fetch('/logout', {credentials: 'include'}).then(() => {
         this.$store.commit('logout');
       });
     }
   }
 }
</script>

<style>
 /* bits and pieces copy-pasted from metasp.eu */
 .b-header {
   background-color: rgba(0, 105, 224, 0.85);
   position: fixed;
   z-index: 1000;
   top: 0;
   left: 0;
   right: 0;
   height: 62px;
   display: flex;
   justify-content: space-between;
 }

 .header-item {
   display: flex;
   float: left;
   border: none;
   padding: 0px 20px;
   height: 62px;
   font-size: 16px;
 }

 @media (max-width: 1000px) {
   .header-item {
     padding: 0px 10px;
     font-size: 14px;
   }
 }

 /* vertically centered */
 .vc {
   align-self: center;
 }

 .btn-link {
   text-decoration: none;
   color: inherit;
 }

 .page-link {
   text-align: center;
   color: #eee;
   cursor: pointer;
 }

 .router-link-active > .page-link, .page-link:hover {
   background: rgba(0, 0, 0, 0.1);
   outline-color: rgba(0, 0, 0, 0.3);
   outline-style: solid;
   outline-width: 1px;
 }

 .page-link:hover {
   background: rgba(0, 0, 0, 0.1);
   outline-color: rgba(0, 0, 0, 0.3);
   outline-style: solid;
   outline-width: 1px;
 }

 .router-link-active > .page-link {
   font-weight: 700;
   color: white;
 }

 .page-link:hover > .vc {
   color: white;
 }

 #metasp-logo {
   padding-left: 15px;
 }

 #email-link-container {
   display: inline-flex;
 }
</style>
