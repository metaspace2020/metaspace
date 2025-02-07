import { computed } from 'vue'
import { useHead } from '@unhead/vue'

const disabledDomains = ['staging.metaspace2020.org', 'staging.metaspace2020.eu']
const currentHost = window?.location?.hostname

export function useSeoMeta(route) {
  useHead(
    computed(() => {
      let title = 'METASPACE - Spatial metabolomics'
      let description = 'The platform for metabolite annotation of imaging mass spectrometry data. '
      const ogImage = 'https://metaspace2020.org/assets/logo.png'
      let robots = 'noindex, nofollow'

      if (route.name === 'home' || route.name === 'about') {
        description =
          'The platform for metabolite annotation of imaging mass spectrometry data.' +
          'The METASPACE platform hosts an engine for metabolite annotation of imaging mass spectrometry ' +
          'data as well as a spatial metabolite knowledgebase of the metabolites from thousands of public ' +
          'datasets provided by the community.'
        robots = 'index, follow'
      } else if (route.name === 'annotations') {
        title = 'METASPACE - Annotations'
        robots = 'index, follow'
        description = `Browse annotations from all public datasets using our interactive interface. 
        Search and compare your annotations with those from the community.`
      } else if (route.name === 'datasets') {
        title = 'METASPACE - Datasets'
        robots = 'index, follow'
        description = `Explore all public datasets using our interactive interface. Upload yours and 
        contribute to the community. `
      } else if (route.name === 'publication-list') {
        title = 'METASPACE - Publications'
        robots = 'index, follow'
        description = `Explore all publications presenting METASPACE or its methods. `
      } else if (route.name === 'detectability') {
        title = 'METASPACE - Detectability'
        robots = 'index, follow'
        description = `Large-Scale Evaluation of Spatial Metabolomics Protocols and Technologies tool. `
      } else if (route.name === 'project-list') {
        title = 'METASPACE - Projects'
        robots = 'index, follow'
        description = `If you are preparing a scientific publication based on METASPACE annotations, create 
        aproject and follow the ‘Scientific Publishing’ workflow. `
      } else if (route.name === 'group-list') {
        title = 'METASPACE - Groups'
        robots = 'index, follow'
        description = `Upload, share and manage data from your group in a simple, effective and safe way.`
      }

      console.log('currentHost', currentHost)

      if (disabledDomains.includes(currentHost)) {
        console.warn(`SEO metadata disabled for staging environment: ${currentHost}`)
        robots = 'noindex, nofollow'
      }

      return {
        title,
        meta: [
          { name: 'description', content: description },
          { property: 'og:title', content: title },
          { property: 'og:image', content: ogImage },
          { name: 'robots', content: robots },
        ],
      }
    })
  )
}
