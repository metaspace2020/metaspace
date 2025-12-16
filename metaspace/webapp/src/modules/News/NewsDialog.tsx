import { computed, defineComponent, watch } from 'vue'
import { ElDialog, ElButton, ElIcon } from '../../lib/element-plus'
import { useMutation } from '@vue/apollo-composable'
import { recordNewsEventMutation, type News, type NewsType } from '../../api/news'
import { Document, SetUp, User } from '@element-plus/icons-vue'
import RichText from '../../components/RichText/RichText'
import './NewsDialog.scss'

interface NewsDialogProps {
  modelValue: boolean
  news: News | null
}

export const NewsDialog = defineComponent({
  name: 'NewsDialog',
  props: {
    modelValue: {
      type: Boolean,
      required: true,
    },
    news: {
      type: Object as () => News | null,
      default: null,
    },
  },
  emits: ['update:modelValue', 'newsRead'],
  setup(props: NewsDialogProps, { emit }) {
    const visible = computed({
      get: () => props.modelValue,
      set: (value: boolean) => emit('update:modelValue', value),
    })

    const { mutate: recordNewsEvent } = useMutation(recordNewsEventMutation)

    const getNewsIcon = (type: NewsType) => {
      switch (type) {
        case 'message':
          return Document
        case 'system_notification':
          return SetUp
        case 'news':
        default:
          return User
      }
    }

    const getPrimaryColor = () => {
      // Use CSS variable if available, fallback to default primary color
      return 'var(--el-color-primary, #1187EE)'
    }

    const getHeaderGradient = () => {
      const primary = getPrimaryColor()
      // Create a gradient using the primary color with slight variations
      return `linear-gradient(135deg, ${primary} 0%, color-mix(in srgb, ${primary} 80%, #000000) 100%)`
    }

    const formatDate = (dateString: string) => {
      try {
        let date: Date

        // Check if it's a Unix timestamp (string of digits)
        if (/^\d+$/.test(dateString)) {
          // Parse as Unix timestamp in milliseconds
          const timestamp = parseInt(dateString, 10)
          date = new Date(timestamp)
        } else {
          // Try parsing as regular date string
          date = new Date(dateString)
        }

        if (isNaN(date.getTime())) {
          return '' // Return empty string to hide the date section
        }

        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      } catch (error) {
        console.error('Error formatting date:', error, 'dateString:', dateString)
        return '' // Return empty string to hide the date section
      }
    }

    const handleClose = async () => {
      // Automatically mark as read when closing
      if (props.news) {
        try {
          await recordNewsEvent({
            input: {
              newsId: props.news.id,
              eventType: 'viewed',
            },
          })

          // Save to localStorage to prevent showing again
          const viewedNews = JSON.parse(localStorage.getItem('viewedNewsIds') || '[]')
          if (!viewedNews.includes(props.news.id)) {
            viewedNews.push(props.news.id)
            localStorage.setItem('viewedNewsIds', JSON.stringify(viewedNews))
          }

          emit('newsRead', props.news.id)
        } catch (error) {
          console.error('Error marking news as read:', error)
        }
      }

      visible.value = false
    }

    // Auto-mark as viewed when dialog opens
    watch(
      () => props.modelValue,
      async (newValue) => {
        if (newValue && props.news) {
          try {
            await recordNewsEvent({
              input: {
                newsId: props.news.id,
                eventType: 'viewed',
              },
            })
          } catch (error) {
            console.error('Error recording news view:', error)
          }
        }
      }
    )

    return () => (
      <ElDialog
        modelValue={visible.value}
        onUpdate:modelValue={(val: boolean) => (visible.value = val)}
        title=""
        width="540px"
        closeOnClickModal={true}
        closeOnPressEscape={true}
        showClose={false}
        onClose={handleClose}
        class="news-dialog"
        alignCenter={true}
        modal={true}
        lockScroll={true}
        destroyOnClose={false}
        v-slots={{
          footer: () => (
            <div class="dialog-footer">
              <ElButton type="primary" onClick={handleClose} class="news-close-button">
                Close
              </ElButton>
            </div>
          ),
        }}
      >
        {props.news && (
          <div class="news-dialog-content">
            {/* Fixed Header with gradient background */}
            <div class="news-header" style={{ background: getHeaderGradient(props.news.type) }}>
              <div class="header-content">
                <div class="flex items-start gap-4">
                  {/* News type icon */}
                  <div class="w-14 h-14 flex items-center justify-center news-icon rounded-full flex-shrink-0">
                    <ElIcon size={28} class="text-white">
                      {(() => {
                        const IconComponent = getNewsIcon(props.news.type)
                        return <IconComponent />
                      })()}
                    </ElIcon>
                  </div>

                  {/* Title and date aligned with icon */}
                  <div class="flex-1 min-w-0 flex flex-col justify-center">
                    <h2 class="text-2xl font-bold news-title mb-1 leading-tight">{props.news.title}</h2>
                    {props.news.createdAt && formatDate(props.news.createdAt) && (
                      <div class="text-sm news-date">{formatDate(props.news.createdAt)}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div class="news-content">
              <div class="prose max-w-none">
                <RichText
                  content={props.news.content || ''}
                  readonly={true}
                  hideStateStatus={true}
                  contentClassName="text-gray-800"
                />
              </div>
            </div>
          </div>
        )}
      </ElDialog>
    )
  },
})

export default NewsDialog
