<template>
  <div id="app">
    <el-row>
      <metaspace-header>
      </metaspace-header>

      <div id="signin-div">
        <span v-if="authenticated === true">{{ username }}</span>
        <div ref="gSignIn"
             v-show="authenticated === false"
             id="google-signin-button">
          Sign in with Google
        </div>

        <div id="google-signout-button" @click="signOut"
             v-if="authenticated === true">
          Logout
        </div>
      </div>

      <div class="warning">
        NOT PRODUCTION-READY! Known limitations: <b>NO</b> CSV export; <b>NO</b> isotope pattern plot; <b>NO</b> user profiles.
      </div>
    </el-row>

    <router-view></router-view>
  </div>
</template>

<script>
 import MetaspaceHeader from './components/MetaspaceHeader.vue';
 import Vue from 'vue'
 import fetch from 'isomorphic-fetch';

 import gql from 'graphql-tag';

 export default {
   name: 'app',
   data() {
     return {
       googleSignInParams: {
         client_id: "268025466937-o15ia458d8lnuohj09slh1aqbl3ja33i.apps.googleusercontent.com"
       },
       username: '',
       authenticated: undefined
     };
   },
   components: {
     MetaspaceHeader
   },
   mounted() {
     window.gapi.load('auth2', () => {
       window.gapi.auth2.init({
         client_id: this.googleSignInParams.client_id
       }).then((auth2) => {
         const currentUser = auth2.currentUser.get();
         if (currentUser && currentUser.getBasicProfile()) {
           // TODO communicate with the backend
           this.username = currentUser.getBasicProfile().getName();
           this.authenticated = true;
         } else {
           this.authenticated = false;
         }

         this.setupSignInClickHandler(auth2);
       });
     });
   },
   methods: {
     setupSignInClickHandler(auth2) {
       auth2.attachClickHandler(this.$refs.gSignIn, {},
                                this.onSignInSuccess,
                                this.onSignInError);
     },
     onSignInSuccess(guser) {
       const name = guser.getBasicProfile().getName();

       fetch('/googleSignIn', {
         method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({
           id_token:  guser.getAuthResponse().id_token
         }),
         credentials: 'include' // send the cookies
       }).then(resp => resp.json()).then(resp => {
         if (resp.status == 'success') {
           console.log(`Signed in as ${name}`);
           this.authenticated = true;
           this.username = name;
         }
       });
     },

     onSignInError(error) {
       console.log(error);
     },

     signOut() {
       const auth2 = window.gapi.auth2.getAuthInstance();
       if (!auth2) {
         console.log("uninitialized auth2 instance");
         return;
       }

       auth2.signOut().then(() => {
         fetch('/googleSignOut',
               {method: 'POST', credentials: 'include'}).then((resp) => {
           this.authenticated = false;
           this.username = '';
           console.log('Signed out');

           Vue.nextTick(() => this.setupSignInClickHandler(auth2));
         });
       });
     }
   }
 }
</script>

<style>
 #app {
   font-family: 'Roboto', Helvetica, sans-serif;
   -webkit-font-smoothing: antialiased;
   -moz-osx-font-smoothing: grayscale;
   color: #2c3e50;
   margin-top: 0px;
   padding: 3px;
 }

 h1, h2 {
   font-weight: normal;
 }

 a {
   color: #42b983;
 }

 #main-content {
   padding-top: 82px;
 }

 .warning {
   position: fixed;
   z-index: 1000;
   top: 62px;
   left: 0;
   right: 0;
   height: 28px;
   text-align: center;
   background-color: #fd8;
 }

 #signin-div {
   position: fixed;
   align-self: center;
   top: 18px;
   font-size: 18px;
   right: 81px;
   color: white;
   z-index: 1000;
 }

 #google-signin-button, #google-signout-button {
   position: fixed;
   cursor: pointer;
   z-index: 1000;
   top: 11px;
   right: 11px;
   font-size: 18px;
   color: rgb(0, 105, 224);
   background-color: #f8f8f8;
   border-radius: 5px;
   padding: 5px;
 }
</style>
