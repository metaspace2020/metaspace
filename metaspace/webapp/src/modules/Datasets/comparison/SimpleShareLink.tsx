import { defineComponent, reactive } from '@vue/composition-api'
import StatefulIcon from '../../../components/StatefulIcon.vue'
import { ExternalWindowSvg } from '../../../design/refactoringUIIcons'
import { Popover } from '../../../lib/element-ui'
import Vue from 'vue'
import FadeTransition from '../../../components/FadeTransition'

const RouterLink = Vue.component('router-link')

interface SimpleShareLinkProps {
  name: string
  params: any
  query: any
}

export const SimpleShareLink = defineComponent<SimpleShareLinkProps>({
  name: 'SimpleShareLink',
  props: {
    name: { type: String, required: true },
    params: { type: Object },
    query: { type: Object },
  },
  setup(props, ctx) {
    const getUrl = () => {
      return {
        name: props.name,
        params: props.params,
        query: props.query,
      }
    }

    return () => {
      return (
        <Popover
          trigger="hover"
          placement="bottom">
          <div
            slot="reference"
            class="button-reset h-6 w-6 block ml-2">
            <StatefulIcon className="h-6 w-6 pointer-events-none">
              <ExternalWindowSvg/>
            </StatefulIcon>
          </div>
          <FadeTransition class="m-0 leading-5 text-center">
            <div>
              <RouterLink to={getUrl()} target="_blank">
                  Share this link
              </RouterLink>
              <span class="block text-xs tracking-wide">
                opens in a new window
              </span>
            </div>
          </FadeTransition>
        </Popover>
      )
    }
  },
})
