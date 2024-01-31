import { computed, defineComponent, onMounted } from '@vue/composition-api'
import PrimaryIcon from '../../components/PrimaryIcon.vue'
import { CiteMetaspace } from './CiteMetaspace'

import Metaspace from '../../assets/inline/METASPACE.svg'
import MonitorSvg from '../../assets/inline/refactoring-ui/icon-monitor.svg'
import BookSvg from '../../assets/inline/refactoring-ui/icon-book-open.svg'
import BoltSvg from '../../assets/inline/refactoring-ui/icon-bolt.svg'
import UnlockSvg from '../../assets/inline/refactoring-ui/icon-lock-open.svg'
import { useQuery } from '@vue/apollo-composable'
import { countDatasetsQuery } from '../../api/dataset'
import { countUsersQuery } from '../../api/user'
import { countGroupsQuery, countPublicationsQuery } from '../../api/group'
import './AboutPage.scss'

const METALogo = require('../../assets/METASPACE_logomark.png')
const NIDDKLogo = require('../../assets/NIDDK.svg')
const NHLBILogo = require('../../assets/NHLBI.svg')
const EUFlag = require('../../assets/Flag_of_Europe.svg')

interface Props {
  className: string
}

const AboutPage = defineComponent<Props>({
  name: 'AboutPage',
  props: {
    className: {
      type: String,
      default: 'about-page',
    },
  },
  setup(props, ctx) {
    const { $route, $router } = ctx.root

    const queryVars = computed(() => ({
      dFilter: {
        metadataType: 'Imaging MS',
      },
    }))

    const {
      result: datasetCountResult,
    } = useQuery<{countDatasets: any}>(countDatasetsQuery, queryVars)
    const datasetCount = computed(() => datasetCountResult.value != null
      ? datasetCountResult.value.countDatasets : null)

    const {
      result: userCountResult,
    } = useQuery<{countUsers: any}>(countUsersQuery)
    const userCount = computed(() => datasetCountResult.value != null
      ? userCountResult.value.countUsers : null)

    const {
      result: groupCountResult,
    } = useQuery<{countGroups: any}>(countGroupsQuery)
    const groupCount = computed(() => datasetCountResult.value != null
      ? groupCountResult.value.countGroups : null)

    const {
      result: publicationCountResult,
    } = useQuery<{countPublications: any}>(countPublicationsQuery)
    const publicationCount = computed(() => publicationCountResult.value != null
      ? publicationCountResult.value.countPublications : null)

    onMounted(() => {
      if ($route?.hash?.includes('funding')) {
        window.scrollTo({
          top: document?.getElementById('please-appreciate-those-who-funded-it')?.offsetTop,
          left: 0,
          behavior: 'smooth',
        })
      }
    })

    return () => {
      return (
        <div class='sm-about-page text-base leading-6'>
          <div class="bg-primary overflow-hidden w-full">
            <div class="box-border font-display pt-0 pb-10 mx-auto md:max-w-4xl max-w-sm flex items-center">
              <img
                alt='METASPACE logo'
                src={METALogo}
                class="hidden md:block w-66 h-66 -ml-3 lg:-ml-6 p-3 box-border"
              />
              <div class="text-white box-border ml-0 md:ml-4 h-66">
                <h1 class="m-0 md:mt-24 flex flex-col items-start">
                  <Metaspace className="w-auto md:h-18 box-border py-1"/>
                </h1>
                <p class="text-2xl leading-7 m-0 pt-3">
                    The platform for metabolite annotation
                  <br/>
                      of imaging mass spectrometry data
                </p>
              </div>
            </div>
          </div>
          <div
            id="about"
            class="sm-about py-6 px-18 mx-auto box-border max-w-4xl"
          >
            <section class="sm-about-features">
              <h2 class="sr-only">
                Features
              </h2>
              <div>
                <PrimaryIcon className="mb-2" small>
                  <MonitorSvg/>
                </PrimaryIcon>
                <h3>Metabolite annotation</h3>
                <p>
                  <span class='about-link mr-1' onClick={() => { $router.push('/upload') }}>
                    Submit
                  </span>
                  your high-resolution imaging mass spectrometry data to our high-throughput metabolite annotation
                  engine.
                </p>
              </div>
              <div>
                <PrimaryIcon className="mb-2" small>
                  <BookSvg/>
                </PrimaryIcon>
                <h3>Explore the knowledgebase</h3>
                <p>
                  <span class='about-link mr-1' onClick={() => { $router.push('/annotations') }}>
                    Browse
                  </span>
                  annotations from all datasets using our interactive interface. Search and compare your
                  annotations with those from the community.
                </p>
              </div>
              <div>
                <PrimaryIcon
                  className="mb-2"
                  inverse small
                >
                  <BoltSvg/>
                </PrimaryIcon>
                <h3>Get going fast</h3>
                <p>
                  Head to the
                  <span class='about-link mx-1' onClick={() => { $router.push('/upload') }}>
                    upload
                  </span> page to submit a dataset, or try our
                  <span class='about-link mx-1' onClick={() => { $router.push('/help') }}>
                    interactive tutorials
                  </span> if it is your first visit and you would like to get up to speed.
                </p>
              </div>
              <div>
                <PrimaryIcon className="mb-2" small>
                  <UnlockSvg/>
                </PrimaryIcon>
                <h3>Open access</h3>
                <p>
                  The <a
                    href="http://imzml.org/"
                  >imzML input format</a> is an open standard supported by all major mass spectrometer vendors,
                  and all code is <a href="https://github.com/metaspace2020/metaspace">open-source</a>.
                </p>
              </div>
            </section>
          </div>
          <div class="bg-primary overflow-hidden w-full py-6 px-18 mx-auto box-border flex justify-center">
            <section class="sm-about-stats w-full max-w-3xl">
              <h2 class="sr-only">
                Stats
              </h2>
              <div class="flex items-center text-white justify-between">
                <div class="flex flex-col p-0 m-0">
                  <h4 class="text-center p-0 m-0 font-normal">
                    Join the community
                  </h4>
                  <div class="flex flex-wrap">
                    <h3 class="text-center py-2 m-0 w-1/2">
                      {(groupCount.value || 86).toLocaleString()}
                    </h3>
                    <h3 class="text-center py-2 m-0 w-1/2">
                      {(userCount.value || 1771).toLocaleString()}
                    </h3>
                    <h4 class="text-center p-0 m-0 w-1/2 font-normal">
                      Groups
                    </h4>
                    <h4 class="text-center p-0 m-0 w-1/2 font-normal">
                      Users
                    </h4>
                  </div>
                </div>
                <div class="flex flex-col p-0 m-0">
                  <h4 class="text-center p-0 m-0 font-normal">
                    Pushing the science
                  </h4>
                  <div class="flex flex-wrap">
                    <h3 class="text-center py-2 m-0 w-full">
                      {(publicationCount.value || 133).toLocaleString()}
                    </h3>
                    <h4 class="text-center p-0 m-0 w-full font-normal">
                      Publications
                    </h4>
                  </div>
                </div>
                <div class="flex flex-col p-0 m-0">
                  <h4 class="text-center p-0 m-0 font-normal">
                    Explore
                  </h4>
                  <div class="flex flex-wrap">
                    <h3 class="text-center py-2 m-0 w-full">
                      {(datasetCount.value || 7786).toLocaleString()}
                    </h3>
                    <h4 class="text-center p-0 m-0 w-full font-normal">
                      Datasets
                    </h4>
                  </div>
                </div>
              </div>
            </section>
          </div>
          <div
            id="about-pt2"
            class="sm-about py-6 px-18 mx-auto box-border max-w-4xl"
          >
            <section class="sm-about-details max-w-measure-4 mt-0">
              <h2 class="font-display text-primary leading-12 m-0 text-base uppercase tracking-wide">
                Frequently asked questions
              </h2>
              <h3>What is the METASPACE platform?</h3>
              <p>
                The METASPACE platform hosts an engine for metabolite annotation of imaging mass spectrometry data as
                well as a
                spatial metabolite knowledgebase of the metabolites from thousands of public datasets provided by the
                community.
              </p>
              <p>
                The METASPACE platform is developed by software engineers, data scientists and mass spectrometrists
                from the <a
                  href="https://www.embl.de/research/units/scb/alexandrov/"
                >Alexandrov team at EMBL</a>.
              </p>
              <p>
                For more information on methods, see <span class='about-link mx-1'
                  onClick={() => { $router.push('/publications#ours') }}>
                    our publications
                </span>.
              </p>
              <h3>
                How can I contribute?
              </h3>
              <p>
                Read <a href="https://www.nature.com/nmeth/journal/v14/n1/full/nmeth.4072.html">our publication
                in Nature Methods</a>, follow us on <a href="https://twitter.com/metaspace2020">Twitter</a>, spread the
                word, and think of
                us while doing good deeds :)
              </p>
              <ul class="mb-6">
                <li><strong>Have high-resolution imaging mass spectrometry data?</strong> Consider uploading it.</li>
                <li>
                  <strong>Are you a data scientist?</strong> Feel free to the export the metabolite annotations and mine
                  hundreds of thousands of metabolites found in community-provided datasets.
                </li>
              </ul>
              <p>
                For examples of applications, see <span class='about-link ml-1'
                  onClick={() => { $router.push('/publications#community') }}>
                    publications from other users
                </span>.
              </p>
              <CiteMetaspace />
              <h3>
                How to stay in touch?
              </h3>
              <p>
                Follow us on <a href="https://twitter.com/metaspace2020">Twitter</a> for the latest updates,
                and <a href="mailto:contact@metaspace2020.eu">contact us by email</a> for all other inquiries
                or questions.
              </p>
              <h3 id="please-appreciate-those-who-funded-it">
                Funding
              </h3>
              <p>
                We acknowledge funding from the following sources:
              </p>
              <ul class="sm-about-funding">
                <li>
                  <img
                    src={EUFlag}
                    alt="EU"
                  />
                  <span>
                    <b>European Union Horizon2020 and Horizon Europe Programs</b>
                    <br/>
                    under grant agreements
                    <a class='mx-1' href="https://cordis.europa.eu/project/id/634402">634402</a>/
                    <a class='mx-1' href="https://cordis.europa.eu/project/id/773089">773089</a>/
                    <a class='mx-1' href="https://cordis.europa.eu/project/id/773089">825184</a>/
                    <a class='mx-1' href="https://cordis.europa.eu/project/id/101092644">101092644</a>/
                    <a class='ml-1' href="https://cordis.europa.eu/project/id/101092646">101092646</a>
                  </span>
                </li>
                <li>
                  <img
                    src={NIDDKLogo}
                    alt="NIDDK"
                  />
                  <span>
                    <b>
                    National Institutes of Health
                      <abbr class='ml-1' title="National Institute of Diabetes and Digestive and Kidney Diseases">
                        NIDDK</abbr>
                    </b>
                    <br/>
                    Kidney Precision Medicine Project (<a href="https://kpmp.org/">kpmp.org</a>)
                  </span>
                </li>
                <li>
                  <img
                    src={NHLBILogo}
                    alt="NHLBI"
                  />
                  <span>
                    <b>
                    National Institutes of Health
                      <abbr class='ml-1' title="National Heart, Lung, and Blood Institute">NHLBI</abbr>
                    </b>
                    <br/>
                    LungMAP Phase 2 (<a href="https://www.lungmap.net/">lungmap.net</a>)
                  </span>
                </li>
              </ul>
              <h3>Other acknowledgements</h3>
              <p>
                Icons by <a href="http://www.freepik.com/">Freepik</a> from
                <a href="http://www.flaticon.com" class='ml-1'>www.flaticon.com</a>,
                <a href="https://refactoringui.com/book/" class='ml-1'>Refactoring UI</a> and
                <a href="https://material.io/icons" class='ml-1'>Material Icons</a>.
              </p>
            </section>
          </div>
        </div>
      )
    }
  },
})

export default AboutPage
