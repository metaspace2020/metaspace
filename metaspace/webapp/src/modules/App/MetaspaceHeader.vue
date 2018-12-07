<template>
  <div>
    <div :class="healthMessage ? 'spacerWithAlert' : 'spacer'" />
    <div class="b-header">
      <div class="header-items">
        <router-link to="/" class="header-item logo">
          <img src="../../assets/logo.png" alt="Metaspace" title="Metaspace"/>
        </router-link>

        <router-link :to="uploadHref" class="header-item page-link" id='upload-link'>
          Upload
        </router-link>

        <router-link :to="annotationsHref" class="header-item page-link" id='annotations-link'>
          Annotations
        </router-link>

        <router-link :to="datasetsHref" class="header-item page-link" id='datasets-link'>
          Datasets
        </router-link>

        <router-link to="/projects" class="header-item page-link">
          Projects
        </router-link>

        <router-link
          v-if="currentUser && currentUser.primaryGroup"
          :to="primaryGroupHref"
          class="header-item page-link">
          <div class="limit-width">
            {{currentUser.primaryGroup.group.shortName}}
          </div>
        </router-link>
      </div>

      <div class="header-items">
        <router-link to="/help" class="header-item page-link">
          Help
        </router-link>

        <div v-if="loadingUser === 0 && currentUser == null" class="header-items">
          <div class="header-item page-link" @click="showCreateAccount">
            Create account
          </div>

          <div class="header-item page-link" @click="showSignIn">
            Sign in
          </div>
        </div>

        <div v-if="loadingUser === 0 && currentUser != null" class="header-items">
          <div class="submenu-container user-submenu"
               :class="{'submenu-container-open': openSubmenu === 'user'}"
               @mouseenter="handleSubmenuEnter('user')"
               @mouseleave="handleSubmenuLeave('user')">
            <div class="header-item submenu-header"
                 :class="{'router-link-active': matchesRoute('/user/me')}">
              <div class="limit-width" style="color: white;">
                {{ userNameOrEmail }}
                <notification-icon v-if="pendingRequestMessage != null" :tooltip="pendingRequestMessage" tooltipPlacement="left" />
              </div>
            </div>
            <div class="submenu">
              <router-link to="/user/me" class="submenu-item page-link">
                My account
                <notification-icon v-if="pendingRequestMessage != null" :tooltip="pendingRequestMessage" tooltipPlacement="left" />
              </router-link>
              <div class="submenu-item page-link" @click="logout">
                Sign out
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <el-row v-if="healthMessage" class="alert">
      <el-alert show-icon :title="healthMessage" :type="healthSeverity" :closable="false" />
    </el-row>
  </div>
</template>

<script>
  import gql from 'graphql-tag';
  import {signOut} from '../../api/auth';
  import {getSystemHealthQuery, getSystemHealthSubscribeToMore} from '../../api/system';
  import {UserGroupRoleOptions as UGRO} from '../../api/group';
  import {ProjectRoleOptions as UPRO} from '../../api/project';
  import {encodeParams} from '../Filters';
  import {refreshLoginStatus} from '../../graphqlClient';
  import NotificationIcon from '../../components/NotificationIcon.vue';
  import {datasetStatusUpdatedQuery} from '../../api/dataset';

 export default {
   name: 'metaspace-header',

   components: {
     NotificationIcon,
   },

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

     primaryGroupHref() {
       if (this.currentUser && this.currentUser.primaryGroup) {
         const { id, urlSlug } = this.currentUser.primaryGroup.group;
         return {
           name: 'group',
           params: { groupIdOrSlug: urlSlug || id }
         }
       }
     },

     userNameOrEmail() {
       if (this.currentUser && this.currentUser.name) {
         return this.currentUser.name;
       }
       return '';
     },

     healthMessage() {
       const {canMutate = true, message = null} = this.systemHealth || {};
       if (message) {
         return message;
       } else if (!canMutate) {
         return "METASPACE is currently in read-only mode for scheduled maintenance."
       }
     },
     healthSeverity() {
       return this.systemHealth && this.systemHealth.canMutate === false ? 'warning' : 'info';
     },
     pendingRequestMessage() {
       if (this.currentUser != null) {
         if (this.currentUser.groups != null) {
           const invitedGroup = this.currentUser.groups.find(g => g.role === UGRO.INVITED);
           const requestGroup = this.currentUser.groups.find(g => g.role === UGRO.GROUP_ADMIN && g.group.hasPendingRequest);
           if (invitedGroup != null)
             return `You have been invited to join ${invitedGroup.group.name}.`;
           if (requestGroup != null)
             return `${requestGroup.group.name} has a pending membership request.`;
         }
         if (this.currentUser.projects != null) {
           const invitedProject = this.currentUser.projects.find(g => g.role === UPRO.INVITED);
           const requestProject = this.currentUser.projects.find(g => g.role === UPRO.MANAGER && g.project.hasPendingRequest);
           if (invitedProject != null)
             return `You have been invited to join ${invitedProject.project.name}.`;
           if (requestProject != null)
             return `${requestProject.project.name} has a pending membership request.`;
         }
       }
       return null;
     }
   },

   data() {
     return {
       loginEmail: '',
       loadingUser: 0,
       currentUser: null,
       systemHealth: null,
       openSubmenu: null
     };
   },

   apollo: {
     systemHealth: {
       query: getSystemHealthQuery,
       subscribeToMore: getSystemHealthSubscribeToMore,
       fetchPolicy: 'cache-first',
     },
     currentUser: {
       query: gql`query metaspaceHeaderCurrentUserQuery {
         currentUser {
           id
           name
           primaryGroup {
             group {
               id
               shortName
               name
               urlSlug
             }
           }
           groups {
             role
             group {
               id
               name
               hasPendingRequest
             }
           }
           projects {
             role
             project {
               id
               name
               hasPendingRequest
             }
           }
         }
       }`,
       fetchPolicy: 'cache-first',
       loadingKey: 'loadingUser'
     },
     $subscribe: {
       datasetStatusUpdated: {
         query: datasetStatusUpdatedQuery,
         result({ data }) {
           const { dataset, relationship, action, stage, is_new } = data.datasetStatusUpdated;
           if (dataset != null && relationship != null) {
             const { name, submitter } = dataset;

             let message, type;
             if (relationship.type === 'submitter') {
               if (action === 'ANNOTATE' && stage === 'FINISHED') {
                 message = `Processing of dataset ${name} is finished!`;
                 type = 'success';
               } else if (stage === 'FAILED') {
                 message = `Something went wrong with dataset ${name} :(`;
                 type = 'warning';
               } else if (action === 'ANNOTATE' && stage === 'QUEUED' && is_new) {
                 message = `Dataset ${name} has been submitted`;
                 type = 'info';
               } else if (action === 'ANNOTATE' && stage === 'QUEUED' && !is_new) {
                 message = `Dataset ${name} has been submitted for reprocessing`;
                 type = 'info';
               } else if (action === 'ANNOTATE' && stage === 'STARTED') {
                 message = `Started processing dataset ${name}`;
                 type = 'info';
               }
             } else {
               const who = `${submitter.name} (${relationship.name})`;
               if (action === 'ANNOTATE' && stage === 'FINISHED') {
                 message = `Processing of dataset ${name} by ${who} is finished!`;
                 type = 'success';
               } else if (action === 'ANNOTATE' && stage === 'QUEUED' && is_new) {
                 message = `Dataset ${name} has been submitted by ${who}`;
                 type = 'info';
               }
             }
             if (message != null && type != null) {
               this.$notify({ message, type });
             }
           }
         }
       },
     },
   },

   watch: {
     '$route'() {
       // Ensure queries are running, because occasionally the websocket connection doesn't automatically recover
       this.$apollo.subscriptions.systemHealth.start();
       this.$apollo.subscriptions.datasetStatusUpdated.start();
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

     showCreateAccount() {
       this.$store.commit('account/showDialog', 'createAccount');
     },

     showSignIn() {
       this.$store.commit('account/showDialog', 'signIn');
     },

     async logout() {
       await signOut();
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

<style lang="scss" scoped>
  $header-height: 62px;
  $alert-height: 36px;

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

 .spacer {
   height: $header-height + 8px;
 }

 .spacerWithAlert {
   height: $header-height + $alert-height + 8px;
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

 @media (max-width: 1279px) {
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
   white-space: nowrap;
 }
 .limit-width {
   max-width: 250px;
   overflow-wrap: break-word;
   text-align: center;
   overflow: hidden;
   line-height: 1.2em;
   max-height: 2.4em;
 }
 @media (max-width: 1279px) {
   .limit-width {
     max-width: 150px;
   }
 }

 #email-link-container {
   display: inline-flex;
 }

 .alert {
   position: fixed;
   top: $header-height;
   left: 0;
   right: 0;
   border-radius: 0;
   z-index: 1000;

   .el-alert {
     height: $alert-height;
     justify-content: center;
   }
 }
</style>
