import { defineComponent, ref, computed, defineAsyncComponent, onMounted, onBeforeUnmount } from 'vue'
import {useQuery} from "@vue/apollo-composable";
import { getSystemHealthQuery, getSystemHealthSubscribeToMore } from '../../api/system'
import { HeaderLink, HeaderButton } from './HeaderLink'
import './MetaspaceHeader.scss'
import {RouterLink} from "vue-router";


// Image imports
import MetaspaceLogo from '../../assets/images/logo.png'
import {useStore} from "vuex";

// SVG imports
const MenuOpen = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-menu.svg')
);

const MenuClose = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-close.svg')
);


export default defineComponent({
  name: 'metaspace-header',
  components: { MenuOpen, MenuClose, HeaderLink, HeaderButton },
  setup: function() {
    const store = useStore();

    console.log('roo', store.state)
    const scrolled = ref(false);

    const { result: systemHealth, subscribeToMore } = useQuery(getSystemHealthQuery, null, {
      fetchPolicy: 'cache-first'
    });

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
      if ((window.scrollY > 0 && scrolled.value === true) ||
        (window.scrollY === 0 && scrolled.value === false)) {
        return;
      }
      scrolled.value = window.scrollY > 0;
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


    onMounted(() => {
      if ('scrollY' in window) {
        window.addEventListener('scroll', scrollListener, { captive: true, passive: true });
      }

      subscribeToMore(getSystemHealthSubscribeToMore);
    });

    onBeforeUnmount(() => {
      window.removeEventListener('scroll', scrollListener);
    });

    return () => {
      return (
        <div class={`sm-header ${healthMessage.value ? 'h-24' : 'h-16'}`}>
          <div class="fixed top-0 left-0 right-0">
            <div
              class={`
              non-responsive-menu
              transition-colors duration-300 ease-in-out h-16
              flex items-center justify-between
              ${scrolled.value === false ? 'bg-primary' : 'bg-primary-alpha'}`}
            >
              <div class="header-items">
                <RouterLink
                  to="/"
                  className="flex pl-3 pr-4">
                  <img
                    src={MetaspaceLogo}
                    alt="Metaspace"
                    title="Metaspace"
                  />
                </RouterLink>
                <HeaderLink
                  id="upload-link"
                  to={uploadHref()}>
                  Upload
                </HeaderLink>
                <HeaderLink
                  id="annotations-link"
                  to={annotationsHref()}>
                  Annotations
                </HeaderLink>
                <HeaderLink
                  id="datasets-link"
                  to={datasetsHref()}>
                  Datasets
                </HeaderLink>
                <HeaderLink
                  to='/projects'>
                  Projects
                </HeaderLink>
                <HeaderLink
                  to='/groups'>
                  Groups
                </HeaderLink>
              </div>

              <div class="header-items">
                <HeaderLink
                  to='/detectability'>
                  Detectability
                </HeaderLink>
                <HeaderLink
                  to='/help'>
                  Help
                </HeaderLink>
              </div>
            </div>
          </div>
        </div>
      )
    }
  },
})
