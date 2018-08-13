<template>
  <div class="b-header">
    <div class="header-items">
      <router-link to="/" class="header-item logo">
        <img src="../assets/logo.png" alt="Metaspace" title="Metaspace"/>
      </router-link>

      <router-link :to="uploadHref" class="header-item page-link" id='upload-link'>
        Upload
      </router-link>

      <router-link :to="datasetsHref" class="header-item page-link" id='datasets-link'>
        Datasets
      </router-link>

      <router-link :to="annotationsHref" class="header-item page-link" id='annotations-link'>
        Annotations
      </router-link>

      <router-link to="/about" class="header-item page-link">
        About
      </router-link>

      <router-link to="/help" class="header-item page-link">
        Help
      </router-link>
    </div>

    <div v-if="!this.$store.state.authenticated" class="header-items">
      <div v-if="features.newAuth" class="header-items">
        <div class="header-item page-link" @click="showCreateAccount">
          Create account
        </div>

        <div class="header-item page-link" @click="showSignIn">
          Sign in
        </div>
      </div>
      <div v-else class="header-items">
        <el-popover placement="bottom" trigger="click" class="header-items">
          <div slot="reference" class="header-item page-link">
            Sign in
          </div>
          <div id="email-link-container">
            <el-button type="primary" @click="sendLoginLink">Send a link to</el-button>
            <span>
              <el-input v-model="loginEmail" placeholder="e-mail address" />
            </span>
          </div>

          <div style="text-align: center;">
            <div style="margin: 10px; font-size: 18px;">or</div>
            <a href="/auth/google">
              <el-button>Sign in with Google</el-button>
            </a>
          </div>
        </el-popover>
      </div>
    </div>
    <div v-else class="header-items">
      <router-link
        v-if="currentUser && currentUser.primaryGroup"
        :to="`/group/${currentUser.primaryGroup.group.id}`"
        class="header-item page-link">
        <div class="limit-width">
          {{currentUser.primaryGroup.group.shortName}}
        </div>
      </router-link>
      <div class="submenu-container user-submenu"
           :class="{'submenu-container-open': openSubmenu === 'user'}"
           @mouseenter="handleSubmenuEnter('user')"
           @mouseleave="handleSubmenuLeave('user')">
        <div class="header-item submenu-header"
             :class="{'router-link-active': matchesRoute('/user/me')}">
          <div class="limit-width" style="color: white;">
          {{ userNameOrEmail }}
          </div>
        </div>
        <div class="submenu">
          <router-link to="/user/me" class="submenu-item page-link">
            My account
          </router-link>
          <div class="submenu-item page-link" @click="logout">
            Sign out
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import gql from 'graphql-tag';
 import {signOut} from '../api/auth';
 import {encodeParams} from '../url';
  import { refreshLoginStatus } from '../graphqlClient';
 import * as config from '../clientConfig.json';

 export default {
   name: 'metaspace-header',

   computed: {
     uploadHref() {
       return this.href('/upload');
     },

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
     },

     features() {
       return config.features;
     }
   },

   data() {
     return {
       loginEmail: (this.$store.state.user ? this.$store.state.user.email : ''),
       currentUser: null,
       openSubmenu: null
     };
   },

   apollo: {
     currentUser: {
       query: gql`query {
         currentUser {
           primaryGroup {
             group {
               id
               shortName
               name
             }
           }
         }
       }`
     }
   },

   methods: {
     href(path) {
       const lastParams = this.$store.state.lastUsedFilters[path];
       let f = lastParams ? lastParams.filter : {}
       f = Object.assign({}, f, this.$store.getters.filter)
       const link = {
         path,
         query: encodeParams(f, path, this.$store.state.filterLists)
       };
       return link;
     },

     matchesRoute(path) {
       // WORKAROUND: vue-router hides its util function "isIncludedRoute", which would be perfect here
       // return isIncludedRoute(this.$route, path);
       return this.$route.path.startsWith(path);
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
       this.$ga.event({
         eventCategory: 'Link sender',
         eventAction: 'sending login link'
       })
     },

     showCreateAccount() {
       this.$store.commit('account/showDialog', 'createAccount');
     },

     showSignIn() {
       this.$store.commit('account/showDialog', 'signIn');
     },

     async logout() {
       if (config.features.newAuth) {
         await signOut();
       } else {
         await fetch('/logout', {credentials: 'include'});
       }
       await refreshLoginStatus();
     },

     handleSubmenuEnter(submenu) {
       this.openSubmenu = submenu;
     },
     handleSubmenuLeave(submenu) {
       if (this.openSubmenu === submenu) {
         this.openSubmenu = null;
       }
     },
   }
 }
</script>

<style scoped>
 .b-header {
   background-color: rgba(0, 105, 224, 0.85);
   position: fixed;
   z-index: 1000;
   top: 0;
   left: 0;
   right: 0;
   height: 62px;
   display: flex;
   align-items: center;
   justify-content: space-between;
 }

 .header-items {
   display: flex;
   align-items: center;
   height: 100%
 }

 .header-item {
   display: flex;
   border: none;
   padding: 0px 20px;
   font-size: 16px;
   align-self: stretch;
   align-items: center;
   justify-content: center;
 }
 .header-item.logo {
   padding-left: 15px;
 }

 @media (max-width: 1000px) {
   .header-item {
     padding: 0px 10px;
     font-size: 14px;
   }
 }

 .page-link {
   text-align: center;
   color: #eee;
   cursor: pointer;
   text-decoration: none;
 }

 .router-link-active.page-link, .page-link:hover,
 .submenu-container:not(.submenu-container-open) > .router-link-active.submenu-header {
   background: rgba(0, 0, 0, 0.1);
   outline-offset: -1px;
   outline-color: rgba(0, 0, 0, 0.3);
   outline-style: solid;
   outline-width: 1px;
   color: white;
 }

 .router-link-active.page-link {
   font-weight: 700;
 }
 .page-link a {
   text-decoration: none;
 }

 .submenu-container {
   position: relative;
   display: flex;
   align-items: center;
   height: 100%
 }
 .submenu {
   display: none;
   position: absolute;
   flex-direction: column;
   top: 100%;
   right: 0;
   width: 100%;
   min-width: 140px;
   max-width: 200px;

   background-color: rgba(0, 105, 224, 0.85);
   /*background-color: rgb(38, 128, 229);*/
 }
 .submenu-container-open > .submenu {
   display: flex;
 }
 .submenu-item {
   padding: 20px;
   font-size: 16px;
   align-self: stretch;
   justify-content: center;
 }
 .limit-width {
   max-width: 250px;
   overflow-wrap: break-word;
   text-align: center;
   overflow: hidden;
   line-height: 1.2em;
   max-height: 2.4em;
 }
 @media (max-width: 1000px) {
   .limit-width {
     max-width: 150px;
   }
 }

 #email-link-container {
   display: inline-flex;
 }
</style>
