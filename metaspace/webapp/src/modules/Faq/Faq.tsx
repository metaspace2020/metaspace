import { defineComponent, ref } from 'vue'
import { ElCollapse, ElCollapseItem, ElIcon } from '../../lib/element-plus'
import { Plus } from '@element-plus/icons-vue'
import { RouterLink } from 'vue-router'

import './Faq.scss'

export default defineComponent({
  name: 'FAQPage',
  props: {
    className: {
      type: String,
      default: 'faq',
    },
  },
  setup() {
    const activeNames = ref<string[]>([])

    return () => {
      return (
        <div class="faq-page min-h-screen -mt-2">
          <div class="header">
            <div class="max-w-4xl mx-auto text-center">
              <h1 class="md:text-6xl font-bold mb-8 tracking-wide">FAQ</h1>
              <p class="text-xl md:text-xl opacity-90">
                Welcome to the METASPACE FAQ page! Here you'll find answers to common questions about using the
                platform, uploading and analyzing datasets, and exploring its features. If you don't find your question
                answered here, you can visit our{' '}
                <a
                  href={
                    'https://github.com/metaspace2020/metaspace/discussions/categories/q-a?' +
                    'discussions_q=is%3Aopen+category%3AQ%26A'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  class="!text-white hover:!text-blue-700 underline"
                >
                  Q&A page
                </a>{' '}
                to check other technical issues, ask more questions or connect with other users and the METASPACE team.
              </p>
            </div>
          </div>

          <div class="max-w-4xl mx-auto py-16 px-4">
            <div class="space-y-4">
              <ElCollapse
                modelValue={activeNames.value}
                onUpdate:modelValue={(value: string[]) => (activeNames.value = value)}
                class="faq-collapse"
                {...({} as any)}
              >
                <ElCollapseItem name="1" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                  {{
                    title: () => (
                      <div class="flex items-center justify-between w-full py-4 px-6">
                        <span class="text-lg font-medium text-gray-900 text-left">
                          What data formats are supported?
                        </span>
                        <ElIcon
                          class={`transition-transform duration-200 ${
                            activeNames.value.includes('1') ? 'rotate-45' : ''
                          }`}
                          size={24}
                          {...({} as any)}
                        >
                          <Plus />
                        </ElIcon>
                      </div>
                    ),
                    default: () => (
                      <div class="px-6 pb-6 pt-2">
                        <p class="text-gray-700 leading-relaxed text-xl">
                          METASPACE only accepts data in the{' '}
                          <a href="https://www.ms-imaging.org/imzml/" target="_blank" rel="noopener noreferrer">
                            imzML
                          </a>{' '}
                          centroided format. Please check out{' '}
                          <a
                            href={
                              'https://docs.google.com/document/d/e/' +
                              '2PACX-1vTT4QrMQ2RJMjziscaU8S3gbznlv6Rm5ojwrsdAXPbR5bt7Ivp' +
                              '-ThkC0hefrk3ZdVqiyCX7VU_ddA62/pub'
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            our instructions
                          </a>{' '}
                          for converting datasets into this format. If you are experiencing difficulties, please contact
                          your instrument vendor.
                        </p>
                      </div>
                    ),
                  }}
                </ElCollapseItem>

                <ElCollapseItem name="2" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                  {{
                    title: () => (
                      <div class="flex items-center justify-between w-full py-4 px-6">
                        <span class="text-lg font-medium text-gray-900 text-left">
                          What molecules can I expect to be detected using my protocol?
                        </span>
                        <ElIcon
                          class={`transition-transform duration-200 ${
                            activeNames.value.includes('2') ? 'rotate-45' : ''
                          }`}
                          size={24}
                          {...({} as any)}
                        >
                          <Plus />
                        </ElIcon>
                      </div>
                    ),
                    default: () => (
                      <div class="px-6 pb-6 pt-2">
                        <p class="text-gray-700 leading-relaxed text-xl">
                          METASPACE includes a detectability tool that helps assess the likelihood of observing specific
                          metabolites in imaging mass spectrometry data. Check out this feature in our{' '}
                          <RouterLink to="/detectability">Detectability web interface</RouterLink>. For more information
                          about the studies behind our detectability tool, check out this{' '}
                          <a
                            href="https://www.biorxiv.org/content/10.1101/2024.01.29.577354v1"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            paper
                          </a>
                          .
                        </p>
                      </div>
                    ),
                  }}
                </ElCollapseItem>

                <ElCollapseItem name="3" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                  {{
                    title: () => (
                      <div class="flex items-center justify-between w-full py-4 px-6">
                        <span class="text-lg font-medium text-gray-900 text-left">
                          What molecular databases are available in METASPACE?
                        </span>
                        <ElIcon
                          class={`transition-transform duration-200 ${
                            activeNames.value.includes('3') ? 'rotate-45' : ''
                          }`}
                          size={24}
                          {...({} as any)}
                        >
                          <Plus />
                        </ElIcon>
                      </div>
                    ),
                    default: () => (
                      <div class="px-6 pb-6 pt-2">
                        <p class="text-gray-700 leading-relaxed text-xl">
                          METASPACE supports multiple molecular databases for annotation, such as HMDB and LipidMaps, to
                          ensure comprehensive small molecule and lipid identification. There are more core annotation
                          databases available as core databases in METASPACE, check out our{' '}
                          <RouterLink to="/help">help</RouterLink> page for more information.
                        </p>
                      </div>
                    ),
                  }}
                </ElCollapseItem>

                <ElCollapseItem name="4" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                  {{
                    title: () => (
                      <div class="flex items-center justify-between w-full py-4 px-6">
                        <span class="text-lg font-medium text-gray-900 text-left">
                          Can I access METASPACE programmatically?
                        </span>
                        <ElIcon
                          class={`transition-transform duration-200 ${
                            activeNames.value.includes('4') ? 'rotate-45' : ''
                          }`}
                          size={24}
                          {...({} as any)}
                        >
                          <Plus />
                        </ElIcon>
                      </div>
                    ),
                    default: () => (
                      <div class="px-6 pb-6 pt-2">
                        <p class="text-gray-700 leading-relaxed text-xl">
                          Yes, you can access METASPACE programmatically via its API. The METASPACE platform provides a
                          python client that allows users to interact with the system, enabling tasks such as dataset
                          uploads, annotation results retrieval, creating custom databases, and many more. This is
                          useful for integrating METASPACE functionality into automated workflows or custom analysis
                          pipelines. For detailed API documentation and examples, visit the{' '}
                          <a
                            href="https://metaspace2020.readthedocs.io/en/latest/"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            METASPACE API guide
                          </a>
                          .
                        </p>
                      </div>
                    ),
                  }}
                </ElCollapseItem>

                <ElCollapseItem name="5" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                  {{
                    title: () => (
                      <div class="flex items-center justify-between w-full py-4 px-6">
                        <span class="text-lg font-medium text-gray-900 text-left">How can I publish my project?</span>
                        <ElIcon
                          class={`transition-transform duration-200 ${
                            activeNames.value.includes('5') ? 'rotate-45' : ''
                          }`}
                          size={24}
                          {...({} as any)}
                        >
                          <Plus />
                        </ElIcon>
                      </div>
                    ),
                    default: () => (
                      <div class="px-6 pb-6 pt-2">
                        <p class="text-gray-700 leading-relaxed text-xl">
                          Once all your datasets are linked to a single project, you can generate two separate links
                          from the publishing tab: one for inclusion in your manuscript and another for reviewer access.
                          This allows reviewers to view the project without making it publicly available. Only project
                          managers have the ability to publish the project.
                        </p>
                      </div>
                    ),
                  }}
                </ElCollapseItem>

                <ElCollapseItem name="6" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                  {{
                    title: () => (
                      <div class="flex items-center justify-between w-full py-4 px-6">
                        <span class="text-lg font-medium text-gray-900 text-left">
                          How can I access tutorials and documentation?
                        </span>
                        <ElIcon
                          class={`transition-transform duration-200 ${
                            activeNames.value.includes('6') ? 'rotate-45' : ''
                          }`}
                          size={24}
                          {...({} as any)}
                        >
                          <Plus />
                        </ElIcon>
                      </div>
                    ),
                    default: () => (
                      <div class="px-6 pb-6 pt-2">
                        <p class="text-gray-700 leading-relaxed text-xl">
                          You can explore interactive tours covering main features in METASPACE on our{' '}
                          <RouterLink to="/help">Help page</RouterLink>, which also includes a step-by-step guide to
                          using METASPACE.
                        </p>
                      </div>
                    ),
                  }}
                </ElCollapseItem>

                <ElCollapseItem name="7" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                  {{
                    title: () => (
                      <div class="flex items-center justify-between w-full py-4 px-6">
                        <span class="text-lg font-medium text-gray-900 text-left">
                          What should I do if my dataset fails to upload or the processing is taking too long?
                        </span>
                        <ElIcon
                          class={`transition-transform duration-200 ${
                            activeNames.value.includes('7') ? 'rotate-45' : ''
                          }`}
                          size={24}
                          {...({} as any)}
                        >
                          <Plus />
                        </ElIcon>
                      </div>
                    ),
                    default: () => (
                      <div class="px-6 pb-6 pt-2">
                        <p class="text-gray-700 leading-relaxed text-xl">
                          If you encounter issues with dataset uploads or if processing is taking longer than expected,
                          please contact the support team. They can help troubleshoot the issue and provide guidance.
                          You can reach them via{' '}
                          <RouterLink to="/contact" class="text-blue-600 hover:text-blue-700 underline">
                            Contact page
                          </RouterLink>{' '}
                          for personalized assistance.
                        </p>
                      </div>
                    ),
                  }}
                </ElCollapseItem>
              </ElCollapse>
            </div>
          </div>
        </div>
      )
    }
  },
})
