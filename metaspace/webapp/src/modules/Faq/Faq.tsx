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
                  <ElCollapseItem name="1plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
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

                  <ElCollapseItem name="2plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
                            You can subscribe to the Free plan that allows up to 3 private submissions and can be
                            upgraded to any other plan.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="3plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
                            Initially, METASPACE Pro supports private submissions and includes dedicated support to help
                            research groups manage large or complex academic projects efficiently. We are also planning
                            to introduce additional features that will be available exclusively in METASPACE Pro.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="4plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            Is the subscription valid for a user or for a METASPACE group?
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
                          <p class="text-gray-700 leading-relaxed text-lg">
                            All METASPACE Pro plans are designed for groups, so every member within a group enjoys the
                            full benefits of the chosen plan.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="5plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
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

                  <ElCollapseItem name="6plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
                            The subscription plan limits the number of private submissions, not the total number of
                            private datasets currently stored in the group. Converting private datasets to public does
                            not increase your available private submission quota, but you can change the visibility
                            status of your datasets at any time.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="7plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
                            If your METASPACE Pro subscription ends, your existing private datasets will remain
                            accessible to you and your group; nothing will be lost. You will no longer be able to submit
                            new private datasets or reprocess existing private datasets. However, you will still be able
                            to access all your private datasets or make them public.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="8plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
                            No, reprocessing a private dataset is not counted as a new private submission. However,
                            there's a reprocessing quota for each plan separate from the main quota for private
                            submission. Check out the{' '}
                            <a href="/plans" target="_blank" rel="noopener noreferrer">
                              plans table
                            </a>{' '}
                            for more information.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="9plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">
                            How can I monitor my private usage quota?
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
                          <p class="text-gray-700 leading-relaxed text-lg mb-4">
                            On your Groups page, you will find a tab labeled <b>“Subscription”</b> that provides details
                            about your paid plan, including your submission and reprocessing quotas. This section shows
                            the number of private submissions and how many remain. The same bar displaying these
                            counters is also visible on the <b>Upload</b> page during dataset submission.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="10plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg mb-4">
                            <b>Upgrading:</b>
                          </p>
                          <p class="text-gray-700 leading-relaxed text-lg mb-4">
                            You can upgrade your subscription at any time. When you upgrade, you&apos;ll receive a
                            refund for any unused submissions from your current plan, and the new plan and its quota
                            will become available immediately.
                          </p>
                          <p class="text-gray-700 leading-relaxed text-lg mb-4">
                            <b>Downgrading and Refunds:</b>
                          </p>
                          <p class="text-gray-700 leading-relaxed text-lg mb-4">
                            If you wish to downgrade or cancel your plan within the first 30 days of your subscription,
                            refunds are calculated based on your quota usage. For example, if you have used 80% of your
                            quota and request a downgrade within 30 days, you are entitled to a refund corresponding to
                            the unused 20% of your plan.
                          </p>
                          <p class="text-gray-700 leading-relaxed text-lg mb-4">
                            If more than 30 days have passed since the start of your subscription and you still believe
                            a refund is warranted, please contact us through our{' '}
                            <a href="/contact" target="_blank" rel="noopener noreferrer">
                              Contact page
                            </a>{' '}
                            so we can review your case.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="11plans" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
                    {{
                      title: () => (
                        <div class="flex items-center justify-between w-full py-4 px-6">
                          <span class="text-lg font-medium text-gray-900 text-left">How do coupon codes work?</span>
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
                          <p class="text-gray-700 leading-relaxed text-lg mb-4">
                            Coupon codes can be applied during checkout to receive a discount on your subscription. If
                            you have a code, simply enter it in the “Enter coupon code” field before completing your
                            payment. The discount will be automatically applied, and you&apos;ll see the updated total
                            before confirming your purchase.
                          </p>
                          <p class="text-gray-700 leading-relaxed text-lg mb-4">
                            Most coupon codes can be used once within a specified time period.
                          </p>
                          <p class="text-gray-700 leading-relaxed text-lg mb-4">
                            If you encounter any issues applying your code, please visit our{' '}
                            <a href="/contact" target="_blank" rel="noopener noreferrer">
                              Contact page
                            </a>{' '}
                            for assistance.
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
                  <ElCollapseItem name="1tech" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
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

                  <ElCollapseItem name="2tech" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
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

                  <ElCollapseItem name="3tech" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
                            Multiple molecular databases are supported for annotation, such as HMDB and LipidMaps, to
                            ensure comprehensive small molecule and lipid identification. There are more core annotation
                            databases available as core databases, check out our{' '}
                            <a href="/learn" target="_blank" rel="noopener noreferrer">
                              learn
                            </a>{' '}
                            page for more information.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="4tech" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
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

                  <ElCollapseItem name="5tech" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
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

                  <ElCollapseItem name="6tech" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
                            Our main{' '}
                            <a
                              href="https://docs.google.com/presentation/d/10h6Kle2hdW_Ma9SdkuFIUiUOT5lBXexZs1jFDb7X08Q"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              tutorial slide deck
                            </a>{' '}
                            provides the latest step-by-step guide. You can also explore interactive tours that walk you
                            through the basic features, including detailed instructions for using them in both METASPACE
                            Academic and METASPACE Pro. For additional details, visit our{' '}
                            <a href="/learn" target="_blank" rel="noopener noreferrer">
                              Learn page
                            </a>
                            .
                          </p>
                          <p class="text-gray-700 leading-relaxed text-lg">
                            For common questions or troubleshooting, we also encourage you to visit our{' '}
                            <a
                              href="https://github.com/metaspace2020/metaspace/discussions"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              GitHub Discussions page
                            </a>
                            , where you can browse existing Q&A, check whether your question has already been answered,
                            or post a new discussion to connect directly with the team and other users.
                          </p>
                        </div>
                      ),
                    }}
                  </ElCollapseItem>

                  <ElCollapseItem name="7tech" class="faq-collapse-item border-b border-gray-200" {...({} as any)}>
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
                          <p class="text-gray-700 leading-relaxed text-lg">
                            If you encounter any issues when submitting a dataset or notice that processing is taking
                            longer than expected, please visit our{' '}
                            <a href="/contact" target="_blank" rel="noopener noreferrer">
                              Contact page
                            </a>{' '}
                            for assistance. There, you can find different types of support options tailored to your
                            needs, including help with troubleshooting and submission guidance.
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
