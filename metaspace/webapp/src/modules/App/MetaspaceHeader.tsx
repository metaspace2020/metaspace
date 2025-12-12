import { computed, defineAsyncComponent, defineComponent, onBeforeUnmount, onMounted, reactive, Transition } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { getSystemHealthQuery, getSystemHealthSubscribeToMore } from '../../api/system'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'

import NotificationIcon from '../../components/NotificationIcon.vue'
import { HeaderButton, HeaderLink } from './HeaderLink'

import { UserGroupRoleOptions as UGRO } from '../../api/group'
import { ProjectRoleOptions as UPRO } from '../../api/project'
import { userProfileQuery } from '../../api/user'
import { signOut } from '../../api/auth'
import { refreshLoginStatus } from '../../api/graphqlClient'

import {
  ElAlert,
  ElDropdownMenu,
  ElDropdownItem,
  ElRow,
  ElButton,
  ElIcon,
  ElDropdown,
  ElDivider,
} from '../../lib/element-plus'
import { ArrowDown } from '@element-plus/icons-vue'

import './MetaspaceHeader.scss'

// Image imports
import MetaspaceLogo from '../../assets/images/logo.png'
import { encodeParams } from '../Filters'

// SVG imports
const MenuOpen = defineAsyncComponent(() => import('../../assets/inline/refactoring-ui/icon-menu.svg'))

const MenuClose = defineAsyncComponent(() => import('../../assets/inline/refactoring-ui/icon-close.svg'))

interface MetaspaceHeaderState {
  loginEmail: string
  openSubmenu: string | null
  scrolled: boolean
  responsiveMenuOpen: boolean
  hoveredTab: string | null
  mobileExpandedMenus: Set<string>
}

export default defineComponent({
  name: 'metaspace-header',
  components: { MenuOpen, MenuClose, HeaderLink, HeaderButton, Transition },
  setup: function () {
    const state = reactive<MetaspaceHeaderState>({
      loginEmail: '',
      openSubmenu: null,
      scrolled: false,
      responsiveMenuOpen: false,
      hoveredTab: null,
      mobileExpandedMenus: new Set<string>(),
    })

    const store = useStore()
    const route = useRoute()
    const router = useRouter()

    const { result: systemHealth, subscribeToMore } = useQuery(getSystemHealthQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const { result: currentUserResult, loading: loadingUser } = useQuery(userProfileQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const currentUser: any = computed(() =>
      currentUserResult.value != null ? currentUserResult.value.currentUser : null
    )

    const pendingRequestMessage: any = computed(() => {
      if (currentUser.value != null) {
        if (currentUser.value?.groups != null) {
          const invitedGroup = currentUser.value?.groups.find((g) => g.role === UGRO.INVITED)
          const requestGroup = currentUser.value?.groups.find(
            (g) => g.role === UGRO.GROUP_ADMIN && g.group.hasPendingRequest
          )
          if (invitedGroup != null) {
            return `You have been invited to join ${invitedGroup.group.name}.`
          }
          if (requestGroup != null) {
            return `${requestGroup.group.name} has a pending membership request.`
          }
        }
        if (currentUser.value?.projects != null) {
          const invitedProject = currentUser.value?.projects.find((g) => g.role === UPRO.INVITED)
          const requestProject = currentUser.value?.projects.find(
            (g) => g.role === UPRO.MANAGER && g.project.hasPendingRequest
          )
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

    const themeVariant = computed(() => store.getters.themeVariant)
    const isOnSplitPage = computed(() => route.path === '/split')

    const isPrimaryColor = computed(() => {
      if (isOnSplitPage.value) {
        return 'bg-gradient-split'
      }
      return themeVariant.value === 'default' ? 'bg-primary' : 'bg-pro'
    })
    const isPrimaryColorAlpha = computed(() => {
      if (isOnSplitPage.value) {
        return 'bg-gradient-split'
      }
      return themeVariant.value === 'default' ? 'bg-primary-alpha' : 'bg-pro-alpha'
    })

    const scrollListener = () => {
      if ((window.scrollY > 0 && state.scrolled === true) || (window.scrollY === 0 && !state.scrolled)) {
        return
      }
      state.scrolled = window.scrollY > 0
    }

    const navigateTo = (path: string, query: any = {}) => {
      const lastParams = store.state.lastUsedFilters[path]
      let f = lastParams ? lastParams.filter : {}
      f = Object.assign({}, f, store.getters.filter)
      const mergedQuery = Object.assign({}, f, query)

      router.push({
        name: path,
        query: encodeParams(mergedQuery, path, store.state.filterLists),
      })
    }

    const showCreateAccount = () => {
      store.commit('account/showDialog', 'createAccount')
    }

    const showSignIn = () => {
      store.commit('account/showDialog', 'signIn')
    }

    const logout = async () => {
      await signOut()
      store.commit('setThemeVariant', 'default')
      await refreshLoginStatus()
    }

    const showResponsiveMenu = (value: boolean = false) => {
      state.responsiveMenuOpen = value
      // Reset mobile expanded menus when closing responsive menu
      if (!value) {
        state.mobileExpandedMenus.clear()
      }
    }

    const toggleMobileMenu = (menuId: string) => {
      if (state.mobileExpandedMenus.has(menuId)) {
        state.mobileExpandedMenus.delete(menuId)
      } else {
        state.mobileExpandedMenus.add(menuId)
      }
    }

    const isMobileMenuExpanded = (menuId: string) => {
      return state.mobileExpandedMenus.has(menuId)
    }

    onMounted(() => {
      if ('scrollY' in window) {
        window.addEventListener('scroll', scrollListener, { capture: true, passive: true })
      }

      subscribeToMore(getSystemHealthSubscribeToMore)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('scroll', scrollListener)
    })

    const handleCommand = (command: string) => {
      switch (command) {
        case 'datasets':
          navigateTo('datasets')
          break
        case 'annotations':
          navigateTo('annotations')
          break
        case 'databases':
          navigateTo('databases')
          break
        case 'projects':
          navigateTo('projects')
          break
        case 'contact':
          navigateTo('contact')
          break
        case 'faq':
          navigateTo('faq')
          break
        case 'feature-requests':
          navigateTo('feature-requests')
          break
        case 'learn':
          navigateTo('learn')
          break
        case 'detectability':
          navigateTo('detectability')
          break
        case 'converter':
          window.open('https://github.com/metaspace2020/metaspace-converter', '_blank')
          break
        case 'python-client':
          window.open('https://metaspace2020.readthedocs.io/en/latest/', '_blank')
          break
        case 'profile':
          navigateTo('profile')
          break
        case 'my-groups':
          navigateTo('group-list', { f: 'my-groups' })
          break
        case 'my-projects':
          navigateTo('project-list', { f: 'my-projects' })
          break
        case 'sign-out':
          logout()
          break
        case 'plans':
          navigateTo('plans')
          break
        case 'split':
          navigateTo('split')
          break
        case 'upload':
          navigateTo('upload')
          break
      }
    }

    const handleHover = (isHovered: boolean, label: string) => {
      state.hoveredTab = isHovered ? label : null
    }

    const renderMobileDropdown = (
      label: string,
      menuId: string,
      items: any[],
      notificationMessage: string = '',
      customColor: string = ''
    ) => {
      const isExpanded = isMobileMenuExpanded(menuId)

      return (
        <div class="mobile-dropdown-container w-full">
          <HeaderButton
            class={`w-full text-center header-link mobile-dropdown-trigger ${customColor ? 'bg-amber-500' : ''}`}
            onClick={(e: Event) => {
              e.stopPropagation()
              toggleMobileMenu(menuId)
            }}
          >
            <div class="flex items-center justify-between w-full">
              <span class="flex items-center">
                {label}
                {notificationMessage && <NotificationIcon tooltip={notificationMessage} tooltipPlacement="bottom" />}
              </span>
              <ElIcon class={`ml-2 transition-transform duration-300 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}>
                <ArrowDown />
              </ElIcon>
            </div>
          </HeaderButton>

          <Transition
            name="mobile-dropdown"
            enterActiveClass="transition-all duration-300 ease-out"
            enterFromClass="opacity-0 max-h-0"
            enterToClass="opacity-100 max-h-96"
            leaveActiveClass="transition-all duration-300 ease-in"
            leaveFromClass="opacity-100 max-h-96"
            leaveToClass="opacity-0 max-h-0"
          >
            {isExpanded && (
              <div class="mobile-dropdown-items overflow-hidden">
                {items.map((item, index) => (
                  <HeaderButton
                    key={index}
                    class={`w-full text-center mobile-dropdown-item ${customColor ? 'pro-dropdown-item' : ''}`}
                    onClick={() => {
                      handleCommand(item.command)
                      showResponsiveMenu(false)
                    }}
                  >
                    {item.label}
                  </HeaderButton>
                ))}
              </div>
            )}
          </Transition>
        </div>
      )
    }

    const renderTab = (
      label: string,
      href: any,
      items: any[],
      notificationMessage: string = '',
      customColor: string = '',
      hideIcon: boolean = false
    ) => {
      return (
        <ElDropdown
          type="primary"
          onCommand={handleCommand}
          role="menu"
          v-slots={{
            default: () => (
              <div
                class="h-auto flex flex-row items-center justify-center w-full"
                onMouseenter={() => handleHover(true, label)}
                onMouseleave={() => handleHover(false, label)}
              >
                <div class="text-white font-medium cursor-pointer items-center justify-center">
                  <ElButton
                    type="primary"
                    color={customColor}
                    class={`mr-2 !text-white font-medium cursor-pointer items-center justify-center  border-0 ${
                      customColor ? '' : 'bg-transparent'
                    }`}
                    onClick={() => handleCommand(href)}
                  >
                    <span class="font-bold" style={{ fontSize: '15px' }}>
                      {label}
                    </span>
                    {notificationMessage && (
                      <NotificationIcon tooltip={notificationMessage} tooltipPlacement="bottom" />
                    )}
                    {!hideIcon && (
                      <ElIcon
                        class="ml-1 mt-0.5 transition-transform duration-300"
                        style={{ transform: state.hoveredTab === label ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >
                        <ArrowDown />
                      </ElIcon>
                    )}
                  </ElButton>
                </div>
              </div>
            ),
            dropdown: () => (
              <ElDropdownMenu>
                {items.map((item, index) => (
                  <ElDropdownItem
                    class={customColor ? 'hover:!text-amber-500 hover:!bg-amber-500/10' : ''}
                    command={item.command}
                    key={index}
                  >
                    {item.label}
                  </ElDropdownItem>
                ))}
              </ElDropdownMenu>
            ),
          }}
        />
      )
    }

    const renderLeftTabs = () => {
      return (
        <>
          {renderTab('Datasets', 'datasets', [
            { command: 'datasets', label: 'Datasets' },
            { command: 'annotations', label: 'Annotations' },
            { command: 'upload', label: 'Upload' },
            { command: 'databases', label: 'Databases' },
            { command: 'projects', label: 'Projects' },
          ])}

          {renderTab('Tools', 'detectability', [
            { command: 'detectability', label: 'Detectability' },
            { command: 'converter', label: 'METASPACE converter' },
            { command: 'python-client', label: 'Python client' },
          ])}

          {renderTab('Support', 'contact', [
            { command: 'contact', label: 'Contact' },
            { command: 'faq', label: 'FAQ' },
            { command: 'feature-requests', label: 'Feature requests' },
            { command: 'learn', label: 'Learn' },
          ])}
        </>
      )
    }

    const renderMobileLeftTabs = () => {
      return (
        <>
          {renderMobileDropdown('Datasets', 'datasets-mobile', [
            { command: 'datasets', label: 'Datasets' },
            { command: 'annotations', label: 'Annotations' },
            { command: 'upload', label: 'Upload' },
            { command: 'databases', label: 'Databases' },
            { command: 'projects', label: 'Projects' },
          ])}

          {renderMobileDropdown('Tools', 'tools-mobile', [
            { command: 'detectability', label: 'Detectability' },
            { command: 'converter', label: 'METASPACE converter' },
            { command: 'python-client', label: 'Python client' },
          ])}

          {renderMobileDropdown('Support', 'support-mobile', [
            { command: 'contact', label: 'Contact' },
            { command: 'faq', label: 'FAQ' },
            { command: 'feature-requests', label: 'Feature requests' },
            { command: 'learn', label: 'Learn' },
          ])}
        </>
      )
    }

    const renderNotLoggedIn = (show: boolean = true) => {
      if (!show) return null
      return (
        <>
          <HeaderButton class="header-link" onClick={showCreateAccount}>
            Create account
          </HeaderButton>
          <HeaderButton class="header-link" onClick={showSignIn}>
            Sign in
          </HeaderButton>
        </>
      )
    }

    return () => {
      return (
        <div class={`sm-header ${healthMessage.value ? 'h-24' : 'h-16'}`}>
          <div class="fixed top-0 left-0 right-0">
            <div
              class={`
              non-responsive-menu
              transition-colors duration-300 ease-in-out h-16
              flex items-center justify-between
              ${state.scrolled === false ? isPrimaryColor.value : isPrimaryColorAlpha.value}`}
            >
              <div class="header-items">
                <RouterLink to="/" class="flex pl-3 pr-4">
                  <div class="relative">
                    <img src={MetaspaceLogo} alt="Metaspace" title="Metaspace" />
                    {themeVariant.value === 'pro' && (
                      <div class="absolute top-[18px] left-[22px]">
                        <span class="text-xs text-pro font-bold">Pro</span>
                      </div>
                    )}
                  </div>
                </RouterLink>
                {renderLeftTabs()}
              </div>

              <div class="header-items">
                {!loadingUser.value && !currentUser.value && (
                  <div class="header-items mr-1 lg:mr-2">{renderNotLoggedIn()}</div>
                )}
                {!loadingUser.value &&
                  currentUser.value &&
                  renderTab(
                    currentUser.value?.name,
                    'profile',
                    [
                      { command: 'profile', label: 'My account' },
                      { command: 'my-groups', label: 'My groups' },
                      { command: 'my-projects', label: 'My projects' },
                      { command: 'sign-out', label: 'Sign out' },
                    ],
                    pendingRequestMessage.value
                  )}

                <ElDivider direction="vertical" size="large" />

                {renderTab(
                  'METASPACE PRO',
                  'plans',
                  [
                    { command: 'plans', label: 'Plans' },
                    { command: 'split', label: 'Pro x Academic' },
                  ],
                  null,
                  '#FFAB3F',
                  true
                )}
              </div>
            </div>

            <div
              class={`responsive-menu transition-colors duration-300 ease-in-out h-16 flex items-start justify-center
              ${state.scrolled === false ? isPrimaryColor.value : isPrimaryColorAlpha.value} flex-wrap h-full`}
            >
              <div class="header-items flex-row w-full justify-between" style="height: 64px">
                <RouterLink to="/" class="flex pl-3 pr-4">
                  <div class="relative">
                    <img
                      src={MetaspaceLogo}
                      alt="Metaspace"
                      title="Metaspace"
                      onClick={() => {
                        showResponsiveMenu(false)
                      }}
                    />
                    {themeVariant.value === 'pro' && (
                      <div class="absolute top-[18px] left-[22px]">
                        <span class="text-xs text-pro font-bold">Pro</span>
                      </div>
                    )}
                  </div>
                </RouterLink>
                <button
                  class=" button-reset flex h-12 w-12 mr-3"
                  onClick={() => {
                    showResponsiveMenu(!state.responsiveMenuOpen)
                  }}
                >
                  {!state.responsiveMenuOpen && <MenuOpen class="h-full w-full sm-menu-icon" />}
                  {state.responsiveMenuOpen && <MenuClose class="h-full w-full sm-menu-icon" />}
                </button>
              </div>
              {state.responsiveMenuOpen && (
                <div
                  class="header-items flex-col z-50"
                  onClick={(e) => {
                    // Only close if clicking on the background, not on dropdown items
                    if (e.target === e.currentTarget) {
                      showResponsiveMenu(false)
                    }
                  }}
                >
                  {renderMobileLeftTabs()}

                  {renderMobileDropdown(
                    'METASPACE PRO',
                    'pro-mobile',
                    [
                      { command: 'plans', label: 'Plans' },
                      { command: 'split', label: 'Pro x Academic' },
                    ],
                    '',
                    '#FFAB3F'
                  )}

                  {!loadingUser.value && !currentUser.value && <div class="w-full">{renderNotLoggedIn()}</div>}

                  {currentUser.value &&
                    renderMobileDropdown(
                      currentUser.value?.name,
                      'user-mobile',
                      [
                        { command: 'profile', label: 'My account' },
                        { command: 'my-groups', label: 'My groups' },
                        { command: 'my-projects', label: 'My projects' },
                        { command: 'sign-out', label: 'Sign out' },
                      ],
                      pendingRequestMessage.value
                    )}
                </div>
              )}
            </div>

            {healthMessage.value && ( // @ts-ignore
              <ElRow
                class={`transition-colors duration-300 ease-in-out text-white
                ${state.scrolled === false ? 'bg-blue-700' : 'bg-blue-700-alpha'}`}
              >
                <ElAlert
                  showIcon
                  class="h-8 rounded-none justify-center z-0"
                  title={healthMessage.value}
                  closable={false}
                />
              </ElRow>
            )}
          </div>
        </div>
      )
    }
  },
})
