import { computed, defineComponent, onMounted } from 'vue'
import PrimaryIcon from '../../components/PrimaryIcon.vue'
import { CiteMetaspace } from './CiteMetaspace'
import { useQuery } from '@vue/apollo-composable'
import { countDatasetsQuery } from '../../api/dataset'
import { countUsersQuery } from '../../api/user'
import { countGroupsQuery, countPublicationsQuery } from '../../api/group'
import './AboutPage.scss'
import { defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import METALogo from '../../assets/METASPACE_logomark.png'
import Metaspace from '../../assets/inline/METASPACE.svg'
import MonitorSvg from '../../assets/inline/refactoring-ui/icon-monitor.svg'
import BookSvg from '../../assets/inline/refactoring-ui/icon-book-open.svg'
import UnlockSvg from '../../assets/inline/refactoring-ui/icon-lock-open.svg'
import StarSvg from '../../assets/inline/star-icon-land.svg'

const NIDDKLogo = defineAsyncComponent(() => import('../../assets/NIDDK.svg'))
const NHLBILogo = defineAsyncComponent(() => import('../../assets/NHLBI.svg'))
const EUFlag = defineAsyncComponent(() => import('../../assets/Flag_of_Europe.svg'))

const AboutPage = defineComponent({
  name: 'AboutPage',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const store = useStore()

    const queryVars = computed(() => ({
      dFilter: {
        metadataType: 'Imaging MS',
      },
    }))

    const { result: datasetCountResult } = useQuery<{ countDatasets: any }>(countDatasetsQuery, queryVars)
    const datasetCount = computed(() =>
      datasetCountResult.value != null ? datasetCountResult.value.countDatasets : null
    )

    const { result: userCountResult } = useQuery<{ countUsers: any }>(countUsersQuery)
    const userCount = computed(() => (datasetCountResult.value != null ? userCountResult.value.countUsers : null))

    const { result: groupCountResult } = useQuery<{ countGroups: any }>(countGroupsQuery)
    const groupCount = computed(() => (datasetCountResult.value != null ? groupCountResult.value.countGroups : null))

    const { result: publicationCountResult } = useQuery<{ countPublications: any }>(countPublicationsQuery)
    const publicationCount = computed(() =>
      publicationCountResult.value != null ? publicationCountResult.value?.countPublications : null
    )

    const themeVariant = computed(() => store.getters.themeVariant)
    const isPrimaryColor = computed(() => {
      return themeVariant.value === 'default' ? 'bg-primary' : 'bg-pro'
    })

    onMounted(() => {
      if (route?.hash?.includes('funding')) {
        window.scrollTo({
          top: document?.getElementById('please-appreciate-those-who-funded-it')?.offsetTop,
          left: 0,
          behavior: 'smooth',
        })
      }
    })

    return () => {
      return (
        <div class="sm-about-page text-base leading-6 pt-0">
          <div class={`${isPrimaryColor.value} overflow-hidden w-full`}>
            <div class="box-border font-display pt-0 pb-10 mx-auto md:max-w-4xl max-w-sm flex items-center">
              <div class="hidden md:block relative w-66 h-66 -ml-3 lg:-ml-6 p-3 box-border">
                <img alt="METASPACE logo" src={METALogo} class="w-full h-full" />
                {themeVariant.value === 'pro' && (
                  <div class="absolute bottom-[70px] right-[45px]">
                    <span class="text-5xl text-pro font-bold">Pro</span>
                  </div>
                )}
              </div>
              <div class="text-white box-border ml-0 md:ml-4 h-66">
                <h1 class="m-0 md:mt-24 flex flex-col items-start">
                  <Metaspace class="w-auto md:h-18 box-border py-1" />
                </h1>
                <p class="text-2xl leading-7 m-0 pt-3">
                  The platform for metabolite annotation
                  <br />
                  of imaging mass spectrometry data
                </p>
              </div>
            </div>
          </div>
          <div id="about" class="sm-about py-6 px-18 mx-auto box-border max-w-4xl">
            <section class="sm-about-features">
              <h2 class="sr-only">Features</h2>
              <div>
                <PrimaryIcon class="mb-2" small>
                  <MonitorSvg />
                </PrimaryIcon>
                <h3>Metabolite annotation</h3>
                <p>
                  <span
                    class="about-link mr-1"
                    onClick={() => {
                      router.push('/upload')
                    }}
                  >
                    Submit
                  </span>
                  your high-resolution imaging mass spectrometry data to our high-throughput metabolite annotation
                  engine.
                </p>
              </div>
              <div>
                <PrimaryIcon class="mb-2" small>
                  <BookSvg />
                </PrimaryIcon>
                <h3>Explore the knowledgebase</h3>
                <p>
                  <span
                    class="about-link mr-1"
                    onClick={() => {
                      router.push('/annotations')
                    }}
                  >
                    Browse
                  </span>
                  annotations from all datasets using our interactive interface. Search and compare your annotations
                  with those from the community.
                </p>
              </div>
              <div>
                <PrimaryIcon class="mb-2" small>
                  <UnlockSvg />
                </PrimaryIcon>
                <h3>Open access</h3>
                <p>
                  The <a href="http://imzml.org/">imzML input format</a> is an open standard supported by all major mass
                  spectrometer vendors, and all code is{' '}
                  <a href="https://github.com/metaspace2020/metaspace">open-source</a>.
                </p>
              </div>
              <div>
                <div class="star-icon-container bg-pro-op mb-2">
                  <StarSvg class="star-icon svg-pro" />
                </div>
                <h3 class="text-pro">Go Pro</h3>
                <p>
                  Unlock private uploads and dedicated support by upgrading to
                  <span
                    class="about-link ml-1 text-pro"
                    onClick={() => {
                      router.push('/plans')
                    }}
                  >
                    METASPACE Pro
                  </span>
                  .
                </p>
              </div>
            </section>
          </div>
          <div
            class={`${isPrimaryColor.value} overflow-hidden w-full py-6 px-18 mx-auto box-border flex justify-center`}
          >
            <section class="sm-about-stats w-full max-w-3xl">
              <h2 class="sr-only">Stats</h2>
              <div class="flex items-center text-white justify-between">
                <div class="flex flex-col p-0 m-0">
                  <h4 class="text-center p-0 m-0 font-normal">Join the community</h4>
                  <div class="flex flex-wrap">
                    <h3 class="text-center py-2 m-0 w-1/2">{(groupCount.value || 86).toLocaleString()}</h3>
                    <h3 class="text-center py-2 m-0 w-1/2">{(userCount.value || 1771).toLocaleString()}</h3>
                    <h4 class="text-center p-0 m-0 w-1/2 font-normal">Groups</h4>
                    <h4 class="text-center p-0 m-0 w-1/2 font-normal">Users</h4>
                  </div>
                </div>
                <div class="flex flex-col p-0 m-0">
                  <h4 class="text-center p-0 m-0 font-normal">Pushing the science</h4>
                  <div class="flex flex-wrap">
                    <h3 class="text-center py-2 m-0 w-full">{(publicationCount.value || 133).toLocaleString()}</h3>
                    <h4 class="text-center p-0 m-0 w-full font-normal">Publications</h4>
                  </div>
                </div>
                <div class="flex flex-col p-0 m-0">
                  <h4 class="text-center p-0 m-0 font-normal">Explore</h4>
                  <div class="flex flex-wrap">
                    <h3 class="text-center py-2 m-0 w-full">{(datasetCount.value || 7786).toLocaleString()}</h3>
                    <h4 class="text-center p-0 m-0 w-full font-normal">Datasets</h4>
                  </div>
                </div>
              </div>
            </section>
          </div>
          <div id="about-pt2" class="sm-about py-6 px-18 mx-auto box-border max-w-4xl">
            <section class="sm-about-details max-w-measure-4 mt-0">
              <h3>Community Discussion</h3>
              <p>
                Join METASPACE{' '}
                <a href="https://github.com/metaspace2020/metaspace/discussions/categories/q-a" target="_blank">
                  community discussions
                </a>{' '}
                , where you can ask questions, share ideas, and get help from the METASPACE team and other users.
              </p>
              <h3>What is the METASPACE platform?</h3>
            </section>
            <section class="sm-about-details max-w-measure-4 mt-0">
              <p>
                The METASPACE platform hosts an engine for metabolite annotation of imaging mass spectrometry data as
                well as a spatial metabolite knowledgebase of the metabolites from thousands of public datasets provided
                by the community.
              </p>
              <p>
                The METASPACE platform is split into METASPACE Academic and METASPACE Pro. Understanding the{' '}
                <a href="/split" class="text-blue-600 hover:text-blue-800 underline">
                  differences between the two
                </a>{' '}
                is important to choose the right one for your needs.
              </p>
              <p>
                The METASPACE platform is developed by software engineers, data scientists and mass spectrometrists from
                the <a href="https://ateam.ucsd.edu/">Alexandrov team at UCSD</a>.
              </p>
              <p>
                For more information, check out{' '}
                <span
                  class="about-link mx-1"
                  onClick={() => {
                    router.push('/publications#ours')
                  }}
                >
                  our methods and related publications
                </span>
                .
              </p>
              <h3>How can you contribute?</h3>
              <ul class="mb-6">
                <li>
                  <strong>Share Ideas and Connect</strong> Join our community to provide feedback,
                  <a href="https://github.com/metaspace2020/metaspace/discussions/categories/ideas" target="_blank">
                    suggest features
                  </a>
                  , and brainstorm solutions.
                </li>
                <li>
                  <strong>Promote and Share the Platform</strong> Share it with colleagues, collaborators, and on{' '}
                  <a href="https://twitter.com/metaspace2020" target="_blank">
                    social media
                  </a>
                  .
                </li>
              </ul>
              <CiteMetaspace />
              <h3>How to stay in touch?</h3>
              <p>
                First, please check our <a href="/help">Help section</a> and{' '}
                <a href="https://github.com/metaspace2020/metaspace/discussions" target="_blank">
                  Discussions forum
                </a>{' '}
                for any questions you might have. If you don’t find what you need, please{' '}
                <a href="/contact">contact us</a>.
              </p>
              <h3 id="please-appreciate-those-who-funded-it">Funding</h3>
              <p>We acknowledge funding from the following sources:</p>
              <ul class="sm-about-funding">
                <li>
                  <div class="svg-container">
                    <EUFlag viewBox="0 0 810 540" alt="EU" />
                  </div>
                  <div>
                    <b>European Union Horizon2020 and Horizon Europe Programs</b>
                    <br />
                    <div class="flex flex-wrap">
                      under grant agreements
                      <a class="mx-1" href="https://cordis.europa.eu/project/id/634402">
                        634402
                      </a>
                      /
                      <a class="mx-1" href="https://cordis.europa.eu/project/id/773089">
                        773089
                      </a>
                      /
                      <a class="mx-1" href="https://cordis.europa.eu/project/id/773089">
                        825184
                      </a>
                      /
                      <a class="mx-1" href="https://cordis.europa.eu/project/id/101092644">
                        101092644
                      </a>
                      /
                      <a class="ml-1" href="https://cordis.europa.eu/project/id/101092646">
                        101092646
                      </a>
                    </div>
                  </div>
                </li>
                <li>
                  <div class="svg-container">
                    <NIDDKLogo viewBox="0 0 208 130" alt="NIDDK" />
                  </div>
                  <span>
                    <b>
                      National Institutes of Health
                      <abbr class="ml-1" title="National Institute of Diabetes and Digestive and Kidney Diseases">
                        NIDDK
                      </abbr>
                    </b>
                    <br />
                    Kidney Precision Medicine Project (<a href="https://kpmp.org/">kpmp.org</a>)
                  </span>
                </li>
                <li>
                  <div class="svg-container">
                    <NHLBILogo viewBox="0 0 107 67" alt="NHLBI" />
                  </div>
                  <span>
                    <b>
                      National Institutes of Health
                      <abbr class="ml-1" title="National Heart, Lung, and Blood Institute">
                        NHLBI
                      </abbr>
                    </b>
                    <br />
                    LungMAP Phase 2 (<a href="https://www.lungmap.net/">lungmap.net</a>)
                  </span>
                </li>
              </ul>
              <h3>Other acknowledgements</h3>
              <p>
                Icons by <a href="http://www.freepik.com/">Freepik</a> from
                <a href="http://www.flaticon.com" class="ml-1">
                  www.flaticon.com
                </a>
                ,
                <a href="https://refactoringui.com/book/" class="ml-1">
                  Refactoring UI
                </a>{' '}
                and
                <a href="https://material.io/icons" class="ml-1">
                  Material Icons
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      )
    }
  },
})

export default AboutPage
