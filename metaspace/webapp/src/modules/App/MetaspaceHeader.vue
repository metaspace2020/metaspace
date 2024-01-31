<template>
  <div
    class="sm-header"
    :class="healthMessage ? 'h-24' : 'h-16'"
  >
    <div class="fixed top-0 left-0 right-0">
      <div
        class="non-responsive-menu transition-colors duration-300 ease-in-out h-16 flex items-center justify-between"
        :class="{ 'bg-primary': scrolled === false, 'bg-primary-alpha': scrolled === true }"
      >
        <div class="header-items">
          <router-link
            to="/"
            class="flex pl-3 pr-4"
          >
            <img
              src="../../assets/logo.png"
              alt="Metaspace"
              title="Metaspace"
            >
          </router-link>

          <header-link
            id="upload-link"
            :to="uploadHref"
          >
            Upload
          </header-link>

          <header-link
            id="annotations-link"
            :to="annotationsHref"
          >
            Annotations
          </header-link>

          <header-link
            id="datasets-link"
            :to="datasetsHref"
          >
            Datasets
          </header-link>

          <header-link
            to="/projects"
          >
            Projects
          </header-link>

          <header-link
            to="/groups"
          >
            Groups
          </header-link>
        </div>

        <div class="header-items">
          <header-link
            v-if="showSpotting"
            to="/detectability"
          >
            Detectability
          </header-link>
          <header-link
            to="/help"
          >
            Help
          </header-link>

          <div
            v-if="loadingUser === 0 && currentUser == null"
            class="header-items mr-1 lg:mr-2"
          >
            <header-button
              @click="showCreateAccount"
            >
              Create account
            </header-button>

            <header-button
              @click="showSignIn"
            >
              Sign in
            </header-button>
          </div>

          <div
            v-if="loadingUser === 0 && currentUser != null"
            class="header-items mr-1 lg:mr-2"
          >
            <div
              class="relative flex py-2"
              @mouseenter="handleSubmenuEnter('user')"
              @mouseleave="handleSubmenuLeave('user')"
              @click="handleSubmenuLeave('user')"
            >
              <header-link
                id="user-menu"
                to="/user/me"
                :is-active="menuIsOpen"
              >
                <div class="limit-width">
                  {{ userNameOrEmail }}
                  <notification-icon
                    v-if="pendingRequestMessage != null"
                    :tooltip="pendingRequestMessage"
                    tooltip-placement="bottom"
                  />
                </div>
              </header-link>
              <transition
                enter-class="transform opacity-0 scale-95"
                enter-to-class="transform opacity-100 scale-100"
                leave-class="transform opacity-100 scale-100"
                leave-to-class="transform opacity-0 scale-95"
                enter-active-class="transition ease-out duration-100"
                leave-active-class="transition ease-in duration-75"
              >
                <div
                  v-if="menuIsOpen"
                  class="origin-top-right absolute right-0 top-1/2 mt-6 w-40 rounded-md shadow-lg z-10"
                >
                  <div
                    class="py-1 rounded-md bg-white shadow-xs text-sm"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="user-menu"
                  >
                    <router-link
                      to="/user/me"
                      class="no-underline block px-4 py-2 text-gray-700 hover:bg-gray-100 font-medium"
                    >
                      My account
                    </router-link>
                    <button
                      class="button-reset w-full text-left block px-4 py-2 text-gray-700 hover:bg-gray-100"
                      @click="logout"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>

      <div
        class="responsive-menu transition-colors duration-300 ease-in-out h-16 flex items-start justify-center
        bg-primary flex-wrap h-full"
      >
        <div
          class="header-items flex-row w-full justify-between"
          style="height: 64px"
        >
          <router-link
            to="/"
            class="flex pl-3 pr-4"
          >
            <img
              src="../../assets/logo.png"
              alt="Metaspace"
              title="Metaspace"
              @click="showResponsiveMenu(false)"
            >
          </router-link>
          <button
            slot="reference"
            class=" button-reset flex h-12 w-12 mr-3"
            @click="showResponsiveMenu(!responsiveMenuOpen)"
          >
            <menu-open
              v-if="!responsiveMenuOpen"
              class="h-full w-full sm-menu-icon"
            />
            <menu-close
              v-else
              class="h-full w-full sm-menu-icon"
            />
          </button>
        </div>

        <div
          v-if="responsiveMenuOpen"
          class="header-items flex-col"
          @click="showResponsiveMenu(false)"
        >
          <header-link
            id="upload-link"
            :to="uploadHref"
          >
            Upload
          </header-link>

          <header-link
            id="annotations-link"
            :to="annotationsHref"
          >
            Annotations
          </header-link>

          <header-link
            id="datasets-link"
            :to="datasetsHref"
          >
            Datasets
          </header-link>

          <header-link
            to="/projects"
          >
            Projects
          </header-link>

          <header-link
            to="/groups"
          >
            Groups
          </header-link>
          <header-link
            v-if="showSpotting"
            to="/detectability"
          >
            Detectability
          </header-link>
          <header-link
            to="/help"
          >
            Help
          </header-link>
          <header-button
            v-if="loadingUser === 0 && currentUser == null"
            class="w-full text-center"
            @click="showCreateAccount"
          >
            Create account
          </header-button>

          <header-button
            v-if="loadingUser === 0 && currentUser == null"
            class="w-full text-center"
            @click="showSignIn"
          >
            Sign in
          </header-button>
          <header-link
            v-if="currentUser != null"
            to="/user/me"
            class="w-full text-center"
          >
            My account
          </header-link>
          <header-button
            v-if="currentUser != null"
            class="w-full text-center"
            @click="logout"
          >
            Sign out
          </header-button>
        </div>
      </div>

      <el-row
        v-if="healthMessage"
        class="transition-colors duration-300 ease-in-out text-white"
        :class="{ 'bg-blue-700': scrolled === false, 'bg-blue-700-alpha': scrolled === true }"
      >
        <el-alert
          show-icon
          class="h-8 rounded-none justify-center z-0"
          :title="healthMessage"
          :type="healthSeverity"
          :closable="false"
        />
      </el-row>
    </div>
  </div>
</template>

<script>
import MenuOpen from '../../assets/inline/refactoring-ui/icon-menu.svg'
import MenuClose from '../../assets/inline/refactoring-ui/icon-close.svg'

import gql from 'graphql-tag'
import { signOut } from '../../api/auth'
import { getSystemHealthQuery, getSystemHealthSubscribeToMore } from '../../api/system'
import { UserGroupRoleOptions as UGRO } from '../../api/group'
import { ProjectRoleOptions as UPRO } from '../../api/project'
import { encodeParams } from '../Filters'
import { refreshLoginStatus } from '../../api/graphqlClient'
import NotificationIcon from '../../components/NotificationIcon.vue'
import { datasetStatusUpdatedQuery } from '../../api/dataset'
import { HeaderLink, HeaderButton } from './HeaderLink'
import config from '../../lib/config'

/** @type {ComponentOptions<Vue> & Vue} */
const MetaspaceHeader = {
  name: 'metaspace-header',

  components: {
    NotificationIcon,
    HeaderLink,
    HeaderButton,
    MenuOpen,
    MenuClose,
  },

  computed: {
    showSpotting() {
      return config.features.detectability
    },

    uploadHref() {
      return this.href('/upload')
    },

    datasetsHref() {
      return this.href('/datasets')
    },

    annotationsHref() {
      return this.href('/annotations')
    },

    primaryGroupHref() {
      if (this.currentUser && this.currentUser.primaryGroup) {
        const { id, urlSlug } = this.currentUser.primaryGroup.group
        return {
          name: 'group',
          params: { groupIdOrSlug: urlSlug || id },
        }
      }
    },

    userNameOrEmail() {
      if (this.currentUser && this.currentUser.name) {
        return this.currentUser.name
      }
      return ''
    },

    healthMessage() {
      const { canMutate = true, message = null } = this.systemHealth || {}
      if (message) {
        return message
      } else if (!canMutate) {
        return 'METASPACE is currently in read-only mode for scheduled maintenance.'
      }
    },
    healthSeverity() {
      return this.systemHealth && this.systemHealth.canMutate === false ? 'warning' : 'info'
    },
    pendingRequestMessage() {
      if (this.currentUser != null) {
        if (this.currentUser.groups != null) {
          const invitedGroup = this.currentUser.groups.find(g => g.role === UGRO.INVITED)
          const requestGroup = this.currentUser.groups.find(g => g.role === UGRO.GROUP_ADMIN
            && g.group.hasPendingRequest)
          if (invitedGroup != null) {
            return `You have been invited to join ${invitedGroup.group.name}.`
          }
          if (requestGroup != null) {
            return `${requestGroup.group.name} has a pending membership request.`
          }
        }
        if (this.currentUser.projects != null) {
          const invitedProject = this.currentUser.projects.find(g => g.role === UPRO.INVITED)
          const requestProject = this.currentUser.projects.find(g => g.role === UPRO.MANAGER
            && g.project.hasPendingRequest)
          if (invitedProject != null) {
            return `You have been invited to join ${invitedProject.project.name}.`
          }
          if (requestProject != null) {
            return `${requestProject.project.name} has a pending membership request.`
          }
        }
      }
      return null
    },
    menuIsOpen() {
      return this.openSubmenu === 'user'
    },
  },

  data() {
    return {
      loginEmail: '',
      loadingUser: 0,
      currentUser: null,
      systemHealth: null,
      openSubmenu: null,
      scrolled: false,
      responsiveMenuOpen: false,
    }
  },

  mounted() {
    // not supporting this on IE due to lack of hsla and passive listener support
    if ('scrollY' in window) {
      window.addEventListener('scroll', this.scrollListener, { captive: true, passive: true })
    }
  },

  beforeDestroy() {
    window.removeEventListener('scroll', this.scrollListener)
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
      loadingKey: 'loadingUser',
    },
    $subscribe: {
      datasetStatusUpdated: {
        query: datasetStatusUpdatedQuery,
        result(data) {
          const { dataset, relationship, action, stage, isNew } = data.data.datasetStatusUpdated
          if (dataset != null && relationship != null) {
            const { name, submitter } = dataset

            let message, type
            if (relationship.type === 'submitter') {
              if (action === 'ANNOTATE' && stage === 'FINISHED') {
                message = `Processing of dataset ${name} is finished!`
                type = 'success'
              } else if (stage === 'FAILED') {
                message = `Something went wrong with dataset ${name} :(`
                type = 'warning'
              } else if (action === 'ANNOTATE' && stage === 'QUEUED' && isNew) {
                message = `Dataset ${name} has been submitted`
                type = 'info'
              } else if (action === 'ANNOTATE' && stage === 'QUEUED' && !isNew) {
                message = `Dataset ${name} has been submitted for reprocessing`
                type = 'info'
              } else if (action === 'ANNOTATE' && stage === 'STARTED') {
                message = `Started processing dataset ${name}`
                type = 'info'
              }
            } else {
              const who = `${submitter.name} (${relationship.name})`
              if (action === 'ANNOTATE' && stage === 'FINISHED') {
                message = `Processing of dataset ${name} by ${who} is finished!`
                type = 'success'
              } else if (action === 'ANNOTATE' && stage === 'QUEUED' && isNew) {
                message = `Dataset ${name} has been submitted by ${who}`
                type = 'info'
              }
            }
            if (message != null && type != null) {
              this.$notify({ message, type })
            }
          }
        },
      },
    },
  },

  watch: {
    '$route'() {
      // Ensure queries are running, because occasionally the websocket connection doesn't automatically recover
      this.$apollo.subscriptions.systemHealth.start()
      this.$apollo.subscriptions.datasetStatusUpdated.start()
    },
  },

  methods: {
    href(path) {
      const lastParams = this.$store.state.lastUsedFilters[path]
      let f = lastParams ? lastParams.filter : {}
      f = Object.assign({}, f, this.$store.getters.filter)
      const link = {
        path,
        query: encodeParams(f, path, this.$store.state.filterLists),
      }
      return link
    },

    matchesRoute(path) {
      // WORKAROUND: vue-router hides its util function "isIncludedRoute", which would be perfect here
      // return isIncludedRoute(this.$route, path);
      return this.$route.path.startsWith(path)
    },

    showCreateAccount() {
      this.$store.commit('account/showDialog', 'createAccount')
    },

    showResponsiveMenu(value = false) {
      this.responsiveMenuOpen = value
    },

    showSignIn() {
      this.$store.commit('account/showDialog', 'signIn')
    },

    async logout() {
      await signOut()
      await refreshLoginStatus()
    },

    handleSubmenuEnter(submenu) {
      this.openSubmenu = submenu
    },
    handleSubmenuLeave(submenu) {
      if (this.openSubmenu === submenu) {
        this.openSubmenu = null
      }
    },

    scrollListener() {
      if (window.scrollY > 0 && this.scrolled === true
      || window.scrollY === 0 && this.scrolled === false) {
        return
      }
      this.scrolled = window.scrollY > 0
    },
  },
}

export default MetaspaceHeader
</script>

<style lang="scss">
  .sm-header {
    .fixed {
      // z-index should be higher than v-loading's .el-loading-mask (z-index: 2000) so that loading spinners
      // don't overlap the header, but can't be higher than v-tooltip's initial z-index (2001)
      z-index: 2001;
    }

    .header-items {
      display: flex;
      align-items: center;
      height: 100%;
    }

    .limit-width {
      max-width: 250px;
      overflow-wrap: break-word;
      text-align: center;
      overflow: hidden;
      line-height: 1.2em;
      max-height: 2.4em;

      @media (max-width: 1279px) {
        max-width: 150px;
      }
    }

    .el-alert.is-light {
      color: inherit;
      background: inherit;
    }

    .sm-menu-icon .primary,
    .sm-menu-icon .secondary {
      stroke-width: 1px;
      fill: #fff;
    }

    .responsive-menu{
      display: none;

      .header-items {
        width: 100%;

        a{
          width: 100%;
          text-align: center;
        }
      }
    }

    .non-responsive-menu {
      display: flex;
    }

    @media screen and (max-width: 768px) { // md
      .responsive-menu{
        display: flex;
      }
      .non-responsive-menu{
        display: none;
      }
    }
  }
</style>
