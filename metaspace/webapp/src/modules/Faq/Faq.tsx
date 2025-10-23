import { defineComponent, ref } from 'vue'
import { ElCollapse, ElCollapseItem, ElIcon } from '../../lib/element-plus'
import { Plus } from '@element-plus/icons-vue'

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
            {/* METASPACE Pro and METASPACE Academic Section */}
            <div class="mb-12">
              <h2 class="text-xl font-bold text-gray-900 mb-6">METASPACE Pro and METASPACE Academic</h2>
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
                            What's the difference between METASPACE Academic and METASPACE Pro?
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
                          <p class="text-gray-700 leading-relaxed text-xl mb-4">
                            METASPACE Academic and METASPACE Pro are two distinct software platforms for spatial
                            metabolomics, created in 2025 based on the software METASPACE founded in 2014.
                          </p>
                          <p class="text-gray-700 leading-relaxed text-xl mb-4">
                            <b>METASPACE Academic</b> offers a free engine for metabolite annotation for public datasets
                            and hosts an open knowledgebase of spatial metabolomes. It is ideal for open-science
                            projects where the data can be shared publicly with the community.
                          </p>
                          <p class="text-gray-700 leading-relaxed text-xl">
                            <b>METASPACE Pro</b> is a subscription-based cloud software for spatial metabolomics. From
                            the beginning, METASPACE Pro supports private submissions, ensures enhanced support, offers
                            a dedicated compute capacity thus avoiding queue time happening due to big academic
                            projects, and with new functionality to be added.
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
                            Why did you split METASPACE into Academic and Pro?
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
                          <p class="text-gray-700 leading-relaxed text-xl mb-4">
                            As METASPACE has grown, so have the technical demands and operational costs of running,
                            maintaining and supporting a high-quality cloud platform. In particular, processing and
                            supporting private submissions not contributing to the METASPACE public knowledgebase became
                            increasingly costly. While we've been fortunate to receive generous grant support, grants
                            cannot fully cover these increasing costs that required us to develop a new organizational
                            structure.
                          </p>
                          <p class="text-gray-700 leading-relaxed text-xl">
                            This approach increases the sustainability of METASPACE, secures free use of METASPACE
                            Academic for the open-science community, and offers dedicated support and compute capacity
                            to METASPACE Pro users, with additional features to be added.
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
                            Would I be able to submit private datasets on METASPACE Academic?
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
                            No, METASPACE Academic only supports public dataset submissions, which are openly accessible
                            to the entire community.
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
                            Can I still access my existing private datasets if I'm using METASPACE Academic?
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
                            Yes, all of your existing private datasets will remain accessible to you. However, you won't
                            be able to submit any new private datasets while using METASPACE Academic.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>
                </ElCollapse>
              </div>
            </div>

            {/* METASPACE Pro - Plans Section */}
            <div class="mb-12">
              <h2 class="text-xl font-bold text-gray-900 mb-6">METASPACE Pro - Plans</h2>
              <div class="space-y-4">
                <ElCollapse
                  modelValue={activeNames.value}
                  onUpdate:modelValue={(value: string[]) => (activeNames.value = value)}
                  class="faq-collapse"
                  {...({} as any)}
                >
                  <ElCollapseItem name="5" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            How much does it cost to subscribe to METASPACE Pro?
                          </span>
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
                            We have several plans tailored to the number of private submissions your group needs each
                            year. Please see our{' '}
                            <a href="/plans" target="_blank" rel="noopener noreferrer">
                              pricing page
                            </a>{' '}
                            for more details.
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
                            Is it possible to submit private datasets without paying for it?
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
                            You can subscribe to the Free plan that allows up to 3 private submissions and can be
                            upgraded to any other plan.
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
                            What extra features are available in METASPACE Pro beyond what's offered in METASPACE
                            Academic?
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
                            From the beginning, METASPACE Pro supports private submissions as well as provides enhanced
                            support and dedicated compute capacity thus avoiding queue time happening due to big
                            academic projects. We are planning to add other features available only in METASPACE Pro.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="8" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            Is subscription valid for a user or for a METASPACE group?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('8') ? 'rotate-45' : ''
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
                            All METASPACE Pro plans are designed for groups, so every member within a group enjoys the
                            full benefits of the chosen plan.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="9" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            Will collaborators I share private datasets with also need to pay?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('9') ? 'rotate-45' : ''
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
                            No, collaborators you share private datasets with do not need their own METASPACE Pro
                            subscription. The subscription is required for submitting or reprocessing private datasets
                            only. You can invite collaborators to a project where datasets are generated under the
                            subscribed group. This way, all collaborators in that project can access the datasets
                            without being added to the group itself.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="10" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            Can I convert my private datasets in METASPACE Pro to public to increase the number of
                            private submissions available under my plan?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('10') ? 'rotate-45' : ''
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
                            The subscription plan limits the number of private submissions, not the total number of
                            private datasets currently stored in the group. Converting private datasets to public does
                            not increase your available private submission quota, but you can change the visibility
                            status of your datasets at any time.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="11" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            What happens to a private dataset if my subscription ends?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('11') ? 'rotate-45' : ''
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
                            If your METASPACE Pro subscription ends, your existing private datasets will remain
                            accessible to you and your group; nothing will be lost. You will no longer be able to submit
                            new private datasets or reprocess existing private datasets. However, you will still be able
                            to access all your private datasets or make them public.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="12" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            If a private dataset is reprocessed, is that treated as a separate private submission?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('12') ? 'rotate-45' : ''
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
                            No, reprocessing a private dataset is not counted as a new private submission. However,
                            there's a reprocessing quota for each plan separate from the main quota for private
                            submission. Check out the plans table for more information.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="13" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            Can I upgrade/downgrade my plan?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('13') ? 'rotate-45' : ''
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
                          <p class="text-gray-700 leading-relaxed text-xl mb-4">
                            Yes, you can upgrade or downgrade your METASPACE Pro plan at any time.
                          </p>
                          <p class="text-gray-700 leading-relaxed text-xl mb-4">
                            An upgrade takes effect immediately, giving you instant access to the higher plan's
                            benefits. Downgrades are scheduled for the start of your next billing cycle, allowing you to
                            continue enjoying your current Pro features until the cycle ends.
                          </p>
                          <p class="text-gray-700 leading-relaxed text-xl">
                            <b>Please note:</b> no refunds are issued for the remaining period of the current plan in
                            case of downgrades.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>
                </ElCollapse>
              </div>
            </div>

            {/* Technical / Scientific questions Section */}
            <div class="mb-12">
              <h2 class="text-xl font-bold text-gray-900 mb-6">Technical / Scientific questions</h2>
              <div class="space-y-4">
                <ElCollapse
                  modelValue={activeNames.value}
                  onUpdate:modelValue={(value: string[]) => (activeNames.value = value)}
                  class="faq-collapse"
                  {...({} as any)}
                >
                  <ElCollapseItem name="14" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            What data formats are supported?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('14') ? 'rotate-45' : ''
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
                            Only data in the{' '}
                            <a href="https://www.ms-imaging.org/imzml/" target="_blank" rel="noopener noreferrer">
                              imzML
                            </a>{' '}
                            centroided format is accepted. Please check out our{' '}
                            <a
                              href={
                                'https://docs.google.com/document/d/e/' +
                                '2PACX-1vTT4QrMQ2RJMjziscaU8S3gbznlv6Rm5oj' +
                                'wrsdAXPbR5bt7Ivp-ThkC0hefrk3ZdVqiyCX7VU_ddA62/pub'
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              instructions
                            </a>{' '}
                            for converting datasets into this format. If you are experiencing difficulties, please
                            contact your instrument vendor.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="15" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            What molecules can I expect to be detected using my protocol?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('15') ? 'rotate-45' : ''
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
                            METASPACE Academic hosts a detectability tool that helps assess the likelihood of observing
                            specific metabolites in imaging mass spectrometry data. Check out this feature in our{' '}
                            <a href="/detectability" target="_blank" rel="noopener noreferrer">
                              Detectability web interface
                            </a>
                            . For more information about the studies behind our detectability tool, check out this{' '}
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

                  <ElCollapseItem name="16" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            What molecular databases are available?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('16') ? 'rotate-45' : ''
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
                            Multiple molecular databases are supported for annotation, such as HMDB and LipidMaps, to
                            ensure comprehensive small molecule and lipid identification. There are more core annotation
                            databases available as core databases, check out our{' '}
                            <a href="/help" target="_blank" rel="noopener noreferrer">
                              help
                            </a>{' '}
                            page for more information.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="17" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            Is there an API for programmatic access?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('17') ? 'rotate-45' : ''
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
                            Yes, you can access both METASPACE Academic and METASPACE Pro programmatically via API. A
                            python client is provided that allows users to interact with the system, enabling tasks such
                            as dataset uploads, annotation results retrieval, creating custom databases, and many more.
                            For detailed API documentation and examples, visit the{' '}
                            <a
                              href="https://metaspace2020.readthedocs.io/en/latest/"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              API guide
                            </a>
                            .
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="18" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            What is the recommended way to publish my datasets in a paper?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('18') ? 'rotate-45' : ''
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
                            Please create a new{' '}
                            <a href="/projects" target="_blank" rel="noopener noreferrer">
                              project
                            </a>
                            , add your datasets there, go to the Publishing tab in the project and initiate the
                            publishing process. You will receive two URLs: one for inclusion in your manuscript and
                            another for reviewer access. This allows reviewers to view the project without making it
                            publicly available. Only project managers have the ability to publish the project.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="19" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            How can I access tutorials and documentation?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('19') ? 'rotate-45' : ''
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
                            You can explore interactive tours covering main features in METASPACE Academic on our{' '}
                            <a href="/help" target="_blank" rel="noopener noreferrer">
                              help
                            </a>{' '}
                            page, which also includes a step-by-step guide to using those features both in METASPACE
                            Academic and METASPACE Pro.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="20" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            What should I do if my dataset fails to upload or the processing is taking too long?
                          </span>
                          <ElIcon
                            class={`transition-transform duration-200 ${
                              activeNames.value.includes('20') ? 'rotate-45' : ''
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
                            If you encounter issues when submitting a dataset or if processing takes longer than
                            expected, please contact the support team via{' '}
                            <a href="/contact" target="_blank" rel="noopener noreferrer">
                              contact
                            </a>{' '}
                            form. They can help troubleshoot the issue and provide guidance.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>
                </ElCollapse>
              </div>
            </div>
          </div>
        </div>
      )
    }
  },
})
