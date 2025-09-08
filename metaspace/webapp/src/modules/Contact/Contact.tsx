import { defineAsyncComponent, defineComponent, inject, reactive, ref } from 'vue'
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElButton,
  ElRow,
  ElCol,
  ElIcon,
  ElMessage,
} from '../../lib/element-plus'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { userProfileQuery } from '../../api/user'
import { sendContactMessageMutation } from '../../api/user'
import BlueskyIcon from '../../assets/inline/bluesky.png'
import YoutubeIcon from '../../assets/inline/youtube-icon.png'
// import config from '../../lib/config'
import { RouterLink } from 'vue-router'
import './Contact.scss'

const GithubIcon = defineAsyncComponent(() => import('../../assets/inline/github.svg'))
const LinkedinIcon = defineAsyncComponent(() => import('../../assets/inline/linkedin.svg'))
const XIcon = defineAsyncComponent(() => import('../../assets/inline/x.svg'))

interface ContactForm {
  fullName: string
  email: string
  category: string
  message: string
}

export default defineComponent({
  name: 'ContactPage',
  props: {
    className: {
      type: String,
      default: 'contact',
    },
  },
  setup() {
    const formRef = ref()
    const form = reactive<ContactForm>({
      fullName: '',
      email: '',
      category: '',
      message: '',
    })
    const apolloClient = inject(DefaultApolloClient)

    const { onResult } = useQuery<any>(userProfileQuery)

    onResult((result) => {
      form.fullName = result.data?.currentUser?.name || ''
      form.email = result.data?.currentUser?.email || ''
    })

    const categoryOptions = [
      { value: 'bug', label: 'Bug report' },
      { value: 'feature', label: 'Feature request' },
      { value: 'software', label: 'Other software support' },
      { value: 'scientific', label: 'Scientific support' },
      { value: 'other', label: 'Other' },
    ]

    const messageTemplates: Record<string, string> = {
      bug: `On <page>, dataset <datasetId>.
Expected: <what you expected>.
Actual: <error/message>.
Steps to reproduce: 1) <step> 2) <step> 3) <step>.
Environment: <browser/version>, <OS>.
Attachments: <screenshots/logs/links>.`,
      general: `Topic: <topic>.
Question: <your question>.
Context/goal: <what you're trying to do>.
Links: <relevant page or dataset>.`,
      software: `The page <page> is not working as expected.
Expected: <what you expected>.
Actual: <error/message>.
Steps to reproduce: 1) <step> 2) <step> 3) <step>.
Environment: <browser/version>, <OS>.`,
    }

    const rules = {
      fullName: [
        { required: true, message: 'Please enter your full name', trigger: 'blur' },
        { min: 2, max: 100, message: 'Name should be 2-100 characters', trigger: 'blur' },
      ],
      email: [
        { required: true, message: 'Please enter your email', trigger: 'blur' },
        { type: 'email', message: 'Please enter a valid email address', trigger: 'blur' },
      ],
      category: [{ required: true, message: 'Please select a category', trigger: 'change' }],
      message: [
        { required: true, message: 'Please enter your message', trigger: 'blur' },
        { min: 10, max: 1000, message: 'Message should be 10-1000 characters', trigger: 'blur' },
      ],
    }

    const handleCategoryChange = (value: string) => {
      form.category = value
    }

    const handleSubmit = async () => {
      formRef.value?.validate(async (valid: boolean) => {
        if (valid) {
          await apolloClient.mutate({
            mutation: sendContactMessageMutation,
            variables: {
              email: form.email,
              name: form.fullName,
              category: form.category,
              message: form.message,
            },
          })

          // Reset form
          form.fullName = ''
          form.email = ''
          form.category = ''
          form.message = ''

          // Also reset the form validation
          formRef.value?.resetFields()

          ElMessage.success('Thanks for reaching out! We’ll get back to you within 1–2 business days')
        } else {
          ElMessage.error('Please fill in all required fields correctly.')
        }
      })
    }

    return () => {
      return (
        <div class="contact-page min-h-screen -mt-2">
          <div class="header">
            <div class="max-w-4xl mx-auto text-center">
              <h1 class="text-4xl md:text-5xl font-bold mb-4">Contact us</h1>
              <p class="text-xl md:text-2xl opacity-90">We're here to help</p>
            </div>
          </div>

          <div class="max-w-6xl mx-auto py-16 px-4">
            <ElRow gutter={48} align="top">
              <ElCol lg={14} md={24}>
                <div>
                  <h2 class="text-2xl font-bold text-gray-900 mb-2">Looking for answers?</h2>
                  <p class="text-gray-600 mb-4 text-justify">
                    We encourage you to search existing topics or post your questions in{' '}
                    <a
                      href="https://github.com/metaspace2020/metaspace/discussions"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-blue-600 hover:text-blue-700"
                    >
                      GitHub Discussions
                    </a>{' '}
                    first, our main communication channel, so others can benefit from the answers. For common issues,
                    check our <RouterLink to="/faq">FAQ section</RouterLink> for quick responses on topics like download
                    limits. If your request is private, feel free to contact us directly using the form below.
                  </p>
                </div>

                <div>
                  <h3 class="text-lg font-semibold text-gray-900 mb-4">Send us a message</h3>

                  <ElForm
                    ref={formRef}
                    model={form}
                    rules={rules}
                    labelPosition="top"
                    size="default"
                    class="space-y-6"
                    {...({} as any)}
                  >
                    <ElFormItem label="Full Name" prop="fullName" {...({} as any)}>
                      <ElInput
                        modelValue={form.fullName}
                        onUpdate:modelValue={(value: string) => (form.fullName = value)}
                        placeholder="Enter your full name"
                        class="w-full"
                        size="large"
                        {...({} as any)}
                      />
                    </ElFormItem>

                    <ElFormItem label="Email" prop="email" {...({} as any)}>
                      <ElInput
                        modelValue={form.email}
                        onUpdate:modelValue={(value: string) => (form.email = value)}
                        type="email"
                        placeholder="Enter your email address"
                        class="w-full"
                        size="large"
                        {...({} as any)}
                      />
                    </ElFormItem>

                    <ElFormItem label="Category" prop="category" {...({} as any)}>
                      <ElSelect
                        modelValue={form.category}
                        onUpdate:modelValue={handleCategoryChange}
                        placeholder="Select an option"
                        class="w-full"
                        size="large"
                        {...({} as any)}
                      >
                        {categoryOptions.map((option) => (
                          <ElOption key={option.value} value={option.value} label={option.label} />
                        ))}
                      </ElSelect>
                    </ElFormItem>

                    <ElFormItem label="Message" prop="message" {...({} as any)}>
                      <ElInput
                        modelValue={form.message}
                        onUpdate:modelValue={(value: string) => (form.message = value)}
                        type="textarea"
                        placeholder={
                          form.category && messageTemplates[form.category]
                            ? messageTemplates[form.category]
                            : 'Enter your message'
                        }
                        autosize={{ minRows: 6, maxRows: 8 }}
                        class="w-full"
                        maxlength={1000}
                        showWordLimit
                        {...({} as any)}
                      />
                    </ElFormItem>

                    <ElButton
                      type="primary"
                      size="large"
                      class="w-full bg-[#0F87EF] hover:bg-blue-700"
                      onClick={handleSubmit}
                      {...({} as any)}
                    >
                      Send
                    </ElButton>
                  </ElForm>
                </div>
              </ElCol>

              <ElCol lg={10} md={24}>
                <div class="lg:mt-0 mt-12">
                  {/* <h2 class="text-2xl font-bold text-gray-900 mb-0">Prefet to talk live?</h2> */}
                  <div>
                    {/* <div class="mb-6">
                      <p class="text-gray-600 mb-4 text-justify">
                        Book a one-on-one meeting with our team to discuss your questions, get personalized support, or
                        explore collaboration opportunities.
                      </p>

                      <a
                        href={config.appointment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-center no-underline bg-[#0F87EF] text-white font-semibold py-2 px-4 rounded-md"
                      >
                        Book an appointment
                      </a>
                    </div> */}
                  </div>
                  <div class="space-y-6">
                    <div>
                      <h3 class="text-lg font-semibold text-gray-900 mb-4">Interested to engage?</h3>
                      <div class="flex space-x-4">
                        <a
                          href="https://www.linkedin.com/company/metaspace-imaging-ms"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center justify-center w-12 h-12 text-white 
                          rounded-full hover:bg-gray-900 transition-colors"
                        >
                          <ElIcon size={45} color="#fff" {...({} as any)}>
                            <LinkedinIcon class="w-6 h-6" />
                          </ElIcon>
                        </a>

                        <a
                          href="https://github.com/metaspace2020/metaspace/discussions"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center justify-center w-12 h-12 text-white 
                          rounded-full hover:bg-gray-900 transition-colors"
                        >
                          <ElIcon size={50} color="#000" {...({} as any)}>
                            <GithubIcon />
                          </ElIcon>
                        </a>

                        <a
                          href="https://www.youtube.com/@METASPACE2020"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center justify-center w-12 h-12 bg-red-600 text-white 
                          rounded-full hover:bg-red-700 transition-colors"
                        >
                          <img src={YoutubeIcon} alt="Youtube" style={{ width: '60px', height: '50px' }} />
                        </a>

                        <a
                          href="https://bsky.app/profile/metaspace2020.bsky.social"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center justify-center w-12 h-12 text-white rounded-full 
                          hover:bg-gray-900 transition-colors"
                        >
                          <img src={BlueskyIcon} alt="BlueSky" style={{ width: '50px', height: '50px' }} />
                        </a>

                        <a
                          href="https://x.com/metaspace2020"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center justify-center w-12 h-12 text-white rounded-full 
                          hover:bg-gray-900 transition-colors"
                        >
                          <ElIcon size={50} color="#000" {...({} as any)}>
                            <XIcon />
                          </ElIcon>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </ElCol>
            </ElRow>
          </div>
        </div>
      )
    }
  },
})
