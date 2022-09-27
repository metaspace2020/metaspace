import { defineComponent } from '@vue/composition-api'
import './CiteMetaspace.scss'
import Vue from 'vue'

const RouterLink = Vue.component('router-link')

export const CiteMetaspace = defineComponent({
  setup() {
    return () => (
      <div class='cite-meta-wrapper'>
        <h3>
          How should I cite METASPACE?
        </h3>
        <p class='cite-meta-p'>
          Please cite our publication (<a
            href="http://www.nature.com/nmeth/journal/v14/n1/full/nmeth.4072.html"
          >Palmer et al., 2016, Nature Methods</a>)
          and refer to <a href="https://metaspace2020.eu">https://metaspace2020.eu</a>.
        </p>
        <p>
          If you are preparing a scientific publication based on METASPACE annotations, create a
          <RouterLink to="/projects">
            project
          </RouterLink> and follow the &lsquo;Scientific Publishing&rsquo; workflow.
        </p>
      </div>
    )
  },
})
