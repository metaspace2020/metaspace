<template>
  <div
    class="sm-header h-16"
  >
    <div class="fixed top-0 left-0 right-0">
      <div
        class="transition-colors duration-300 ease-in-out h-16 flex items-center justify-between"
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
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import NotificationIcon from '../../components/NotificationIcon.vue'
import { HeaderLink, HeaderButton } from './HeaderLink'

/** @type {ComponentOptions<Vue> & Vue} */
const MetaspaceHeader = {
  name: 'metaspace-header',

  components: {
    NotificationIcon,
    HeaderLink,
    HeaderButton,
  },

  computed: {
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

  methods: {
    href(path) {
      const lastParams = this.$store.state.lastUsedFilters[path]
      let f = lastParams ? lastParams.filter : {}
      f = Object.assign({}, f, this.$store.getters.filter)
      const link = {
        path,
      }
      return link
    },

    matchesRoute(path) {
      // WORKAROUND: vue-router hides its util function "isIncludedRoute", which would be perfect here
      // return isIncludedRoute(this.$route, path);
      return this.$route.path.startsWith(path)
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
  }
</style>
