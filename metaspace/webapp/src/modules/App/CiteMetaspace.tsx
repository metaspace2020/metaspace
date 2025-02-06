import { defineComponent } from 'vue'
import './CiteMetaspace.scss'
import { RouterLink } from 'vue-router'

export const CiteMetaspace = defineComponent({
  setup() {
    return () => (
      <div class="cite-meta-wrapper">
        <h3>How should I cite METASPACE?</h3>
        <p class="cite-meta-p">
          Please cite our publication (
          <a href="http://www.nature.com/nmeth/journal/v14/n1/full/nmeth.4072.html">
            Palmer et al., 2017, Nature Methods
          </a>
          ) and refer to <a href="https://metaspace2020.org">https://metaspace2020.org</a>.
        </p>
        <p>
          If you are preparing a scientific publication based on METASPACE annotations, create a
          <RouterLink to="/projects" class="ml-1">
            project
          </RouterLink>{' '}
          and follow the &lsquo;Scientific Publishing&rsquo; workflow.
        </p>
      </div>
    )
  },
})
