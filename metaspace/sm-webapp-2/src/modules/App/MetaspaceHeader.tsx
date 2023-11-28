import { defineComponent, computed, defineAsyncComponent, onMounted, onBeforeUnmount, reactive } from 'vue'
import {useQuery} from "@vue/apollo-composable";
import { getSystemHealthQuery, getSystemHealthSubscribeToMore } from '../../api/system'
import {RouterLink} from "vue-router";
import {useStore} from "vuex";

import NotificationIcon from "@/components/NotificationIcon.vue";
import { HeaderLink, HeaderButton } from './HeaderLink'

import { UserGroupRoleOptions as UGRO } from '../../api/group'
import { ProjectRoleOptions as UPRO } from '@/api/project'
import {userProfileQuery} from "@/api/user";
import {signOut} from "@/api/auth";
import {refreshLoginStatus} from "@/api/graphqlClient";
import { Transition } from 'vue';

import {ElRow, ElAlert} from "element-plus";


import './MetaspaceHeader.scss'


// Image imports
import MetaspaceLogo from '../../assets/images/logo.png'

// SVG imports
const MenuOpen = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-menu.svg')
);

const MenuClose = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-close.svg')
);

interface MetaspaceHeaderState {
  loginEmail: string,
  openSubmenu: string | null,
  scrolled: boolean,
  responsiveMenuOpen: boolean
}

export default defineComponent({
  name: 'metaspace-header',
  components: { MenuOpen, MenuClose, HeaderLink, HeaderButton, Transition },
  setup: function() {
    const state = reactive<MetaspaceHeaderState>({
      loginEmail: '',
      openSubmenu: null,
      scrolled: false,
      responsiveMenuOpen: false
    })

    const store = useStore();

    const { result: systemHealth, subscribeToMore } = useQuery(getSystemHealthQuery, null, {
      fetchPolicy: 'cache-first'
    });
    const { result: currentUserResult, loading: loadingUser } = useQuery(userProfileQuery, null, {
      fetchPolicy: 'cache-first'
    });
    const currentUser : any = computed(() => currentUserResult.value != null ? currentUserResult.value.currentUser
      : null)

    const pendingRequestMessage : any = computed(() => {
      if (currentUser.value != null) {
        if (currentUser.value?.groups != null) {
          const invitedGroup = currentUser.value?.groups.find(g => g.role === UGRO.INVITED)
          const requestGroup = currentUser.value?.groups.find(g => g.role === UGRO.GROUP_ADMIN
            && g.group.hasPendingRequest)
          if (invitedGroup != null) {
            return `You have been invited to join ${invitedGroup.group.name}.`
          }
          if (requestGroup != null) {
            return `${requestGroup.group.name} has a pending membership request.`
          }
        }
        if (currentUser.value?.projects != null) {
          const invitedProject = currentUser.value?.projects.find(g => g.role === UPRO.INVITED)
          const requestProject = currentUser.value?.projects.find(g => g.role === UPRO.MANAGER
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

    })

    const healthMessage = computed(() => {
      const { canMutate = true, message = null } = systemHealth.value?.systemHealth || {}
      if (message) {
        return message
      } else if (!canMutate) {
        return 'METASPACE is currently in read-only mode for scheduled maintenance.'
      }
      return null
    })

    const scrollListener = () => {
      if ((window.scrollY > 0 && state.scrolled === true) ||
        (window.scrollY === 0 && !state.scrolled)) {
        return;
      }
      state.scrolled = window.scrollY > 0;
    };


    const href = (path: string) => {
      // const lastParams = store.state.lastUsedFilters[path]
      // let f = lastParams ? lastParams.filter : {}
      // f = Object.assign({}, f, store.getters.filter)
      const link = {
        path,
        // query: encodeParams(f, path, store.state.filterLists),
      }
      return link
    }


    const uploadHref = () => {
      return href('/upload')
    }

    const datasetsHref = () => {
      return href('/datasets')
    }

    const annotationsHref = () => {
      return href('/annotations')
    }

    const showCreateAccount = () => {
      store.commit('account/showDialog', 'createAccount')
    }

    const showSignIn = () => {
      store.commit('account/showDialog', 'signIn')
    }

    const handleSubmenuEnter = (submenu: string) => {
      state.openSubmenu = submenu
    }

    const handleSubmenuLeave = (submenu: string) => {
      if (state.openSubmenu === submenu) {
        state.openSubmenu = null
      }
    }

    const logout = async () => {
      await signOut()
      await refreshLoginStatus()
    }

    const  showResponsiveMenu = (value: boolean = false) => {
      state.responsiveMenuOpen = value
    }


    onMounted(() => {
      if ('scrollY' in window) {
        window.addEventListener('scroll', scrollListener, { capture: true, passive: true });
      }

      subscribeToMore(getSystemHealthSubscribeToMore);
    });

    onBeforeUnmount(() => {
      window.removeEventListener('scroll', scrollListener);
    });

    const renderLeftTabs = () => {
      return (
        <>
          <HeaderLink id="upload-link" class='header-link' to={uploadHref()}>Upload</HeaderLink>,
          <HeaderLink id="annotations-link" class='header-link' to={annotationsHref()}>Annotations</HeaderLink>,
          <HeaderLink id="datasets-link" class='header-link' to={datasetsHref()}>Datasets</HeaderLink>,
          <HeaderLink class='header-link' to="/projects">Projects</HeaderLink>,
          <HeaderLink class='header-link' to="/groups">Groups</HeaderLink>
        </>)
    }

    const renderRightTabs = () => {
      return (
        <>
          <HeaderLink class='header-link' to='/detectability'>Detectability</HeaderLink>,
          <HeaderLink class='header-link' to='/help'>Help</HeaderLink>
        </>
        )
    }

    const renderNotLoggedIn = (show: boolean = true) => {
      if(!show) return null
      return (
        <>
          <HeaderButton class='header-link' onClick={showCreateAccount}>Create account</HeaderButton>,
          <HeaderButton class='header-link' onClick={showSignIn}>Sign in</HeaderButton>
        </>
        )
    }

    return () => {
      const isMenuOpen = state.openSubmenu === 'user'
      return (
        <div class={`sm-header ${healthMessage.value ? 'h-24' : 'h-16'}`}>
          <div class="fixed top-0 left-0 right-0">
            <div
              class={`
              non-responsive-menu
              transition-colors duration-300 ease-in-out h-16
              flex items-center justify-between
              ${state.scrolled === false ? 'bg-primary' : 'bg-primary-alpha'}`}>
              <div class="header-items">
                <RouterLink
                  to="/"
                  class="flex pl-3 pr-4">
                  <img
                    src={MetaspaceLogo}
                    alt="Metaspace"
                    title="Metaspace"
                  />
                </RouterLink>
                { renderLeftTabs() }
              </div>

              <div class="header-items">
                {renderRightTabs()}
                {
                  !loadingUser.value
                  && !currentUser.value
                  &&
                  <div class="header-items mr-1 lg:mr-2">
                    {renderNotLoggedIn()}
                  </div>
                }
                {
                  !loadingUser.value
                  && currentUser.value
                  &&
                  <div class="header-items mr-1 lg:mr-2">
                    <div
                      class="relative flex py-2"
                      onMouseenter={() => handleSubmenuEnter('user')}
                      onMouseleave={() => handleSubmenuLeave('user')}
                      onClick={() => handleSubmenuLeave('user')}>
                      <HeaderLink
                        id="user-menu"
                        to="/user/me"
                        isActive={isMenuOpen}>
                        {currentUser.value?.name}
                        {
                          pendingRequestMessage.value
                          &&
                          <NotificationIcon
                            tooltip={pendingRequestMessage.value}
                            tooltipPlacement="bottom"
                          />
                        }
                      </HeaderLink>
                      <transition
                        enterFromClass="transform opacity-0 scale-95"
                        enterToClass="transform opacity-100 scale-100"
                        leaveFromClass="transform opacity-100 scale-100"
                        leaveToClass="transform opacity-0 scale-95"
                        enterActiveClass="transition ease-out duration-100"
                        leaveActiveClass="transition ease-in duration-75"
                      >
                        {
                          isMenuOpen &&
                          <div class="origin-top-right absolute right-0 top-1/2 mt-6 w-40 rounded-md shadow-lg z-10">
                            <div
                              class="py-1 rounded-md bg-white shadow-xs text-sm"
                              role="menu"
                              aria-orientation="vertical"
                              aria-labelledby="user-menu">
                              <RouterLink
                                to="/user/me"
                                class="no-underline block px-4 py-2 text-gray-700 hover:bg-gray-100 font-medium">
                                My account
                              </RouterLink>
                            </div>
                            <button
                              class="button-reset w-full text-left block px-4 py-2 text-gray-700 hover:bg-gray-100"
                              onClick={() => {logout()}}>
                              Sign out
                            </button>
                          </div>
                        }
                      </transition>
                    </div>
                  </div>
                }
              </div>
            </div>

            <div class="responsive-menu transition-colors duration-300 ease-in-out h-16 flex items-start justify-center
              bg-primary flex-wrap h-full">
              <div
                class="header-items flex-row w-full justify-between"
                style="height: 64px">
                <RouterLink
                  to="/"
                  class="flex pl-3 pr-4">
                  <img
                    src={MetaspaceLogo}
                    alt="Metaspace"
                    title="Metaspace"
                    onClick={() => {showResponsiveMenu(false)}}/>
                </RouterLink>
                <button
                  class=" button-reset flex h-12 w-12 mr-3"
                  onClick={() => {showResponsiveMenu(!state.responsiveMenuOpen)}}>
                  {
                    !state.responsiveMenuOpen &&
                    <MenuOpen
                      class="h-full w-full sm-menu-icon"
                    />
                  }
                  {
                    state.responsiveMenuOpen &&
                    <MenuClose
                      class="h-full w-full sm-menu-icon"
                    />
                  }
                </button>
              </div>
              {
                state.responsiveMenuOpen &&
                <div
                  class="header-items flex-col z-50"
                  onClick={() => {showResponsiveMenu(false)}}>
                  {renderLeftTabs() }
                  {renderRightTabs()}
                  {renderNotLoggedIn(!loadingUser.value && !currentUser.value)}
                  {
                    currentUser.value &&
                    <HeaderLink
                      to="/user/me"
                      class="w-full text-center header-link"
                    >
                      My account
                    </HeaderLink>
                  }
                  {
                    currentUser.value &&
                    <HeaderButton
                      class="w-full text-center header-link"
                      onClick={() => {logout()}}>
                      Sign out
                    </HeaderButton>
                  }
                </div>
              }
            </div>

            {
              healthMessage.value &&
              <ElRow
                class={`transition-colors duration-300 ease-in-out text-white
                ${ state.scrolled === false ? 'bg-blue-700' : 'bg-blue-700-alpha'}`}>
                <ElAlert
                  showIcon
                  class="h-8 rounded-none justify-center z-0"
                  title={healthMessage.value}
                  closable={false}
                />
              </ElRow>
            }
          </div>
        </div>
      )
    }
  },
})
