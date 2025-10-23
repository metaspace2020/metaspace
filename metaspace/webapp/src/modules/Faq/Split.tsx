import { defineComponent } from 'vue'
import { RouterLink } from 'vue-router'
import './Split.scss'

export default defineComponent({
  name: 'SplitPage',
  props: {
    className: {
      type: String,
      default: 'split',
    },
  },
  setup() {
    return () => {
      return (
        <div class="split-page min-h-screen -mt-2">
          <div class="header">
            <div class="max-w-4xl mx-auto text-center">
              <h1 class="text-4xl md:text-5xl font-bold mb-4">METASPACE split into Academic & Pro</h1>
              <p class="text-xl md:text-2xl opacity-90">
                We are excited to share with you our new plan to improve METASPACE.
              </p>
            </div>
          </div>

          <div class="max-w-6xl mx-auto py-16 px-4">
            {/* Main Content Section */}
            <div class="main-content mb-16">
              <div class="prose prose-lg max-w-none">
                <p class="text-lg leading-relaxed mb-6">
                  Over the past years, we have experienced superlinear growth in the volume of data submitted to
                  METASPACE due to two factors: growing numbers of users as well as increasing resolution and speed of
                  imaging mass spectrometers. This reflects the maturation of the field and increasing adoption of
                  METASPACE with over 5000 users for whom we processed over 60.000 datasets enabling over 650
                  publications, that we are happy and proud about.
                </p>

                <p class="text-lg leading-relaxed mb-6">
                  Yet, it came with challenges of growing cloud costs as well as increased support efforts for the
                  METASPACE team. At the same time, we see that most datasets are submitted as private and remain
                  private, thus not benefitting the broader scientific community. While we've been fortunate to receive
                  generous grant support, grants cannot fully cover these increasing costs.
                </p>

                <p class="text-lg leading-relaxed mb-6">
                  To address this challenge, we are splitting METASPACE into two software packages:
                </p>

                <ul class="text-lg leading-relaxed mb-6 list-disc pl-6">
                  <li>
                    <strong>METASPACE Academic:</strong> supporting open science, funded by grants,
                  </li>
                  <li>
                    <strong>METASPACE Pro:</strong> supporting users who need private submissions, funded by user
                    subscriptions.
                  </li>
                </ul>

                <p class="text-lg leading-relaxed mb-6">
                  <strong>METASPACE Academic</strong> will offer for free the engine for metabolite annotation for
                  public submissions and hosting the knowledgebase of spatial metabolomes. It is ideal for open-science
                  projects where the data can be shared publicly with the community.
                </p>

                <p class="text-lg leading-relaxed mb-6">
                  <strong>METASPACE Pro</strong> is a subscription-based cloud software for spatial metabolomics based
                  on METASPACE. From the beginning, METASPACE Pro will support private submissions, enhanced support,
                  dedicated compute capacity thus avoiding queue time happening due to big academic projects, and with
                  new functionality to be added.
                </p>

                <p class="text-lg leading-relaxed mb-8">
                  This approach will increase the overall sustainability of METASPACE, secure free use of METASPACE
                  Academic for the open-science community, and enable us to improve software for users who need private
                  submissions.
                </p>
              </div>
            </div>

            {/* What's Staying the Same Section */}
            <div class="staying-same mb-16">
              <h2 class="text-3xl font-bold mb-8">What's staying the same</h2>
              <div class="numbered-list">
                <div class="numbered-item">
                  <span class="number">1.</span>
                  <p class="text">METASPACE Academic stays free and open-source</p>
                </div>
                <div class="numbered-item">
                  <span class="number">2.</span>
                  <p class="text">Public datasets remain accessible to the scientific community</p>
                </div>
                <div class="numbered-item">
                  <span class="number">3.</span>
                  <p class="text">Existing private datasets prior to the split remain accessible</p>
                </div>
                <div class="numbered-item">
                  <span class="number">4.</span>
                  <p class="text">Research collaboration is still one of the core values</p>
                </div>
              </div>
            </div>

            {/* Platform Comparison Table */}
            <div class="platform-comparison mb-16">
              <h2 class="text-3xl font-bold mb-8">How the two platforms differ</h2>
              <div class="overflow-x-auto">
                <table class="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr class="bg-gray-50">
                      <th class="border border-gray-300 px-6 py-4 text-left font-semibold"></th>
                      <th class="border border-gray-300 px-6 py-4 text-center font-semibold text-lg">
                        METASPACE Academic
                      </th>
                      <th class="border border-gray-300 px-6 py-4 text-center font-semibold text-lg">METASPACE Pro</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td class="border border-gray-300 px-6 py-4 font-semibold bg-gray-50">Access</td>
                      <td class="border border-gray-300 px-6 py-4 text-center">Open source, community driven</td>
                      <td class="border border-gray-300 px-6 py-4 text-center">Private, group managed</td>
                    </tr>
                    <tr>
                      <td class="border border-gray-300 px-6 py-4 font-semibold bg-gray-50">Data hosted</td>
                      <td class="border border-gray-300 px-6 py-4 text-center">Public submissions only</td>
                      <td class="border border-gray-300 px-6 py-4 text-center">Private submissions only</td>
                    </tr>
                    <tr>
                      <td class="border border-gray-300 px-6 py-4 font-semibold bg-gray-50">Model</td>
                      <td class="border border-gray-300 px-6 py-4 text-center">
                        Free and open-source, supported by grants
                      </td>
                      <td class="border border-gray-300 px-6 py-4 text-center">Subscription-based</td>
                    </tr>
                    <tr>
                      <td class="border border-gray-300 px-6 py-4 font-semibold bg-gray-50">Support</td>
                      <td class="border border-gray-300 px-6 py-4 text-center">
                        Prioritizing community forums and documentation
                      </td>
                      <td class="border border-gray-300 px-6 py-4 text-center">Dedicated support</td>
                    </tr>
                    {/* <tr>
                      <td class="border border-gray-300 px-6 py-4 font-semibold bg-gray-50">Compute</td>
                      <td class="border border-gray-300 px-6 py-4 text-center">Common queue, first-in-first-out</td>
                      <td class="border border-gray-300 px-6 py-4 text-center">Dedicated compute, with rush options</td>
                    </tr> */}
                  </tbody>
                </table>
              </div>
            </div>

            {/* When to Use Which One */}
            <div class="when-to-use mb-16">
              <h2 class="text-3xl font-bold mb-8">When to use which one</h2>
              <div class="grid md:grid-cols-2 gap-8">
                <div class="academic-section">
                  <h3 class="text-xl font-semibold mb-4">Use METASPACE Academic if you:</h3>
                  <ul class="space-y-3">
                    <li class="flex items-start">
                      <span class="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Ready to share your data publicly</span>
                    </li>
                    <li class="flex items-start">
                      <span class="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Don't need private datasets storage</span>
                    </li>
                    <li class="flex items-start">
                      <span class="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Want to contribute to the community-driven knowledgebase</span>
                    </li>
                  </ul>
                </div>
                <div class="pro-section">
                  <h3 class="text-xl font-semibold mb-4">Use METASPACE Pro if you:</h3>
                  <ul class="space-y-3">
                    <li class="flex items-start">
                      <span class="w-2 h-2 bg-pro rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Need private submissions</span>
                    </li>
                    <li class="flex items-start">
                      <span class="w-2 h-2 bg-pro rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Need dedicated support and prioritized computing capacity with rush options</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Still the Same Community */}
            <div class="community-section mb-16">
              <h2 class="text-3xl font-bold mb-8">Still the same community</h2>
              <div class="prose prose-lg max-w-none">
                <p class="text-lg leading-relaxed mb-6">
                  We understand this change may feel like a big shift, especially for those of you who have relied on
                  METASPACE free use for years. We understand that this can be unsettling, but our intention is simple:
                  to build a sustainable structure that allows METASPACE to keep growing while continuing to serve both
                  open and private research needs.
                </p>
                <p class="text-lg leading-relaxed">
                  We know many of you will have questions or thoughts about this change, and we want to hear them –
                  please{' '}
                  <RouterLink to="/contact" class="text-blue-600 hover:text-blue-800 underline">
                    reach out to us
                  </RouterLink>{' '}
                  and join our webinars focused on this matter. Your feedback helps us make sure both platforms continue
                  to serve the community effectively and transparently.
                </p>
              </div>
            </div>

            {/* Learn More */}
            <div class="learn-more">
              <h2 class="text-3xl font-bold mb-8">Learn more</h2>
              <p class="text-lg mb-8">
                Whether you're continuing with METASPACE Academic or exploring METASPACE Pro service, you can find more
                information below.
              </p>
              <div class="learn-more-list">
                <div class="learn-more-item">
                  <span class="number">1.</span>
                  <p class="text">
                    Continue using <RouterLink to="/"> METASPACE Academic </RouterLink>
                  </p>
                </div>
                <div class="learn-more-item">
                  <span class="number">2.</span>
                  <p class="text">
                    Explore <RouterLink to="/plans"> METASPACE Pro plans </RouterLink>
                  </p>
                </div>
                <div class="learn-more-item">
                  <span class="number">3.</span>
                  <p class="text">
                    Check out our <RouterLink to="/faq"> FAQ </RouterLink> page for more information
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }
  },
})
