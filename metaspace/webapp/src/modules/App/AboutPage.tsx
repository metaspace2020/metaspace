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
            <section id="platforms" class="sm-about-details max-w-3xl mt-0">
              <h2>METASPACE platforms</h2>
              <p>
                As of November 3rd 2025, the METASPACE platform splitted into two different platforms,{' '}
                <b>METASPACE Academic and METASPACE Pro</b>. METASPACE Academic supports public dataset submissions,
                while METASPACE Pro handles private dataset submissions. Both platforms host the same engine for
                metabolite annotation of imaging mass spectrometry data.
              </p>
              <p>
                METASPACE Academic is ideal for open-science projects where the data can be shared publicly with the
                community, while METASPACE Pro is ideal for users who need to keep their datasets private and need
                additional dedicated support.
              </p>
              <p>
                The METASPACE Academic platform is developed by software engineers, data scientists and mass
                spectrometrists from the <a href="https://ateam.ucsd.edu/">Alexandrov team at UCSD</a>, while METASPACE
                Pro is offered as a subscription-based service from Metacloud Inc.
              </p>
              <p>
                To learn more about the reasoning behind splitting METASPACE into separate platforms, and to understand
                their similarities and differences, check out more information{' '}
                <a href="/split" target="_blank">
                  here
                </a>
                .
              </p>
              <p>
                If you still have questions about both platforms, check out our{' '}
                <a href="/faq" target="_blank">
                  FAQ page
                </a>{' '}
                to understand more about how it works.
              </p>
            </section>
            <section id="get-started" class="sm-about-details max-w-3xl mt-0">
              <h2>Getting started</h2>
              <div class="flex flex-col">
                <span class="mb-1">
                  1.{' '}
                  <span class="about-link" onClick={() => store.commit('account/showDialog', 'createAccount')}>
                    Sign up
                  </span>{' '}
                  to create your account if you haven&apos;t already.
                </span>
                <span class="mb-1">
                  2.{' '}
                  <a href="/help" target="_blank">
                    Take our interactive introductory tours
                  </a>{' '}
                  to get familiar with browsing datasets and annotations.
                </span>
                <span class="mb-1">
                  3.{' '}
                  <a href="/datasets" target="_blank">
                    Explore public datasets
                  </a>{' '}
                  in our public knowledgebase.
                </span>
                <span class="mb-1">
                  4. When you are ready to{' '}
                  <a href="/upload" target="_blank">
                    upload your own dataset
                  </a>
                  ,{' '}
                  <a href="/projects" target="_blank">
                    create a project
                  </a>{' '}
                  first (recommended) to keep your work organized.
                </span>
                <span class="mb-1">
                  5.{' '}
                  <a href="/upload" target="_blank">
                    Upload your dataset
                  </a>{' '}
                  and link it to your project.
                </span>
                <span class="mb-1">
                  6. Working in a team?{' '}
                  <a href="/groups" target="_blank">
                    Create a group
                  </a>{' '}
                  to manage and share your projects and datasets.
                </span>
                <span class="mb-1">
                  7. If you plan to submit multiple datasets that need to remain private, explore our{' '}
                  <a href="/plans">METASPACE Pro plans</a>.
                </span>
              </div>
            </section>
            <section id="community-engagement" class="sm-about-details max-w-3xl mt-0">
              <h2>Community engagement</h2>
              <p>
                Join METASPACE{' '}
                <a href="https://github.com/metaspace2020/metaspace/discussions/categories/q-a" target="_blank">
                  community discussions
                </a>{' '}
                , where you can ask questions,{' '}
                <a href="/feature-requests" target="_blank">
                  suggest features
                </a>
                , share ideas, and get help from the METASPACE team and other users.
              </p>
              <p>
                If you’re finding METASPACE platforms useful, help us grow the community by sharing it with your
                colleagues and collaborators.
              </p>
              <CiteMetaspace />
              <h2 class="!mt-0">Learn more and get in touch</h2>
              <p>
                Whether you&apos;re continuing with METASPACE Academic or exploring METASPACE Pro service, you can find
                more information below.
              </p>
              <p class="!mb-1">
                Continue using{' '}
                <a href="/" target="_blank">
                  METASPACE Academic
                </a>{' '}
              </p>
              <p class="!mb-1">
                Explore{' '}
                <a href="/plans" target="_blank">
                  METASPACE Pro plans
                </a>{' '}
              </p>
              <p class="!mb-1">
                Check out our{' '}
                <a href="/faq" target="_blank">
                  FAQ page
                </a>{' '}
                for more information
                <p></p>
                If you still have questions or would like to share feedback, please start by visiting our{' '}
                <a href="/help" target="_blank">
                  Help section
                </a>{' '}
                and{' '}
                <a href="https://github.com/metaspace2020/metaspace/discussions" target="_blank">
                  Discussions forum
                </a>{' '}
                where you might find the answers you need. If you&apos;d like to provide feedback or reach out directly,
                visit our{' '}
                <a href="/contact" target="_blank">
                  contact page
                </a>{' '}
                for more options.
              </p>
              <h2 id="please-appreciate-those-who-funded-it">Funding</h2>
              <p>We acknowledge funding from the following sources:</p>
              <ul class="sm-about-funding">
                <li class="!mb-10">
                  <div class="svg-container">
                    <NHLBILogo viewBox="0 0 107 67" alt="NIH" />
                  </div>
                  <div class="max-w-xl">
                    <b>
                      National Cancer Institute
                      <abbr class="ml-1" title="NCI">
                        NCI
                      </abbr>{' '}
                      and National Institute of Diabetes and Digestive and Kidney
                      <abbr class="ml-1" title="NIDDK">
                        NIDDK
                      </abbr>
                    </b>
                    <br />

                    <div class="flex flex-wrap">
                      under grant agreements
                      <a class="mx-1" target="_blank" href="https://reporter.nih.gov/project-details/11113690">
                        U24CA299590
                      </a>
                      /
                      <a
                        class="mx-1"
                        target="_blank"
                        href="https://reporter.nih.gov/search/autOmWkuI0SYLQaPpCTUzg/project-details/11174318"
                      >
                        U01DK114920
                      </a>
                    </div>
                  </div>
                </li>
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
              </ul>
            </section>
          </div>
        </div>
      )
    }
  },
})

export default AboutPage
