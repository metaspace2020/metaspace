import { computed, defineComponent } from '@vue/composition-api'
import { CiteMetaspace } from './CiteMetaspace'
import { useQuery } from '@vue/apollo-composable'
import { countPublicationsQuery, countReviewsQuery } from '../../api/group'
import PublicationItem from './PublicationItem'
import StatefulIcon from '../../components/StatefulIcon.vue'
import { ExternalWindowSvg } from '../../design/refactoringUIIcons'
import './PublicationsPage.scss'

interface Props {
  className: string
}

const PublicationsPage = defineComponent<Props>({
  name: 'PublicationsPage',
  props: {
    className: {
      type: String,
      default: 'publications-page',
    },
  },
  setup(props, ctx) {
    const {
      result: publicationCountResult,
    } = useQuery<{countPublications: any}>(countPublicationsQuery)
    const publicationCount = computed(() => publicationCountResult.value != null
      ? publicationCountResult.value.countPublications : null)
    const {
      result: reviewsCountResult,
    } = useQuery<{countReviews: any}>(countReviewsQuery)
    const reviewCount = computed(() => reviewsCountResult.value != null
      ? reviewsCountResult.value.countReviews : null)

    return () => {
      return (
        <div class='sm-publications-page'>
          <div class="sm-content-page sm-main-content">
            <h1>Relevant Publications</h1>
            <h2 id="ours">
              Our publications presenting METASPACE or its methods (5)
            </h2>
            <ul>
              <PublicationItem
                title="Spatial Metabolomics and Imaging Mass Spectrometry in the Age of Artificial Intelligence"
                authors="Alexandrov T"
                publisher="Annu. Rev. Biomed. Data Sci."
                year="2020"
                link="https://doi.org/10.1146/annurev-biodatasci-011420-031537"
              />
              <PublicationItem
                title="OffsampleAI: artificial intelligence approach to recognize off-sample mass spectrometry images"
                authors="Ovchinnikova K, Kovalev V, Stuart L, Alexandrov T"
                publisher="BMC Bioinformatics"
                year="2020"
                link="https://doi.org/10.1186/s12859-020-3425-x"
              />
              <PublicationItem
                title="ColocML: Machine learning quantifies co-localization between mass spectrometry images"
                authors="Ovchinnikova K, Stuart L, Rakhlin A, Nikolenko S, Alexandrov T"
                publisher="Bioinformatics"
                year="2020"
                link="https://doi.org/10.1093/bioinformatics/btaa085"
              />
              <PublicationItem
                title="METASPACE: A community-populated knowledge base of spatial metabolomes in health and disease"
                authors="Alexandrov T, Ovchnnikova K, Palmer A, Kovalev V, et al."
                publisher="BioRxiv"
                year="2019"
                link="https://www.biorxiv.org/content/10.1101/539478v1.abstract"
              />
              <PublicationItem
                title="FDR-controlled metabolite annotation for high-resolution imaging mass spectrometry"
                authors={'Palmer A, Phapale P, Chernyavsky I, Lavigne R, Fay D, Tarasov A, Kovalev V, Fuchser J, '
                  + 'Nikolenko S, Pineau C, Becker M, Alexandrov T'}
                publisher="Nat. Methods"
                year="2017"
                link="https://doi.org/10.1038/nmeth.4072"
              />
            </ul>

            <h2 id="others">
              Other publications
            </h2>
            <a
              class="publication-link flex items-center"
              href={'https://scholar.google.com/scholar?q=%22METASPACE%22+AND+%28%22imaging+'
                + 'mass+spectrometry%22+OR+%22mass+spectrometry+imaging%22%29'}
              target="_blank"
            >
              Research articles using METASPACE ({(publicationCount.value || 332).toLocaleString()})
              <StatefulIcon class="h-4 w-4 pointer-events-none">
                <ExternalWindowSvg />
              </StatefulIcon>
            </a>
            <a
              class="publication-link flex items-center mt-1"
              href={'https://scholar.google.com/scholar?q=%22METASPACE%22+AND+%28%22imaging+'
                + 'mass+spectrometry%22+OR+%22mass+spectrometry+imaging%22%29++AND+%22Review+article%22&btnG='}
              target="_blank"
            >
              Reviews ({(reviewCount.value || 34).toLocaleString()})
              <StatefulIcon class="h-4 w-4 pointer-events-none">
                <ExternalWindowSvg />
              </StatefulIcon>
            </a>
            <CiteMetaspace/>
          </div>
        </div>
      )
    }
  },
})

export default PublicationsPage
