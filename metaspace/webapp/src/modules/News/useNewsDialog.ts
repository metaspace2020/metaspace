import { ref, computed, onMounted, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { latestUnreadNewsForDialogQuery, unreadNewsCountQuery, type News } from '../../api/news'

export function useNewsDialog() {
  const showDialog = ref(false)
  const currentNews = ref<News | null>(null)

  // Query for latest unread news
  const { result: newsResult, refetch: refetchNews } = useQuery(
    latestUnreadNewsForDialogQuery,
    () => ({
      lastDismissedTimestamp: localStorage.getItem('newsDialogLastDismissed'),
    }),
    {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'ignore',
    }
  )

  // Query for unread news count
  const { result: countResult, refetch: refetchCount } = useQuery(
    unreadNewsCountQuery,
    {},
    {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'ignore',
    }
  )

  const latestUnreadNews = computed(() => (newsResult.value as any)?.latestUnreadNewsForDialog || null)
  const unreadCount = computed(() => (countResult.value as any)?.unreadNewsCount || 0)

  const checkAndShowNews = () => {
    const news = latestUnreadNews.value
    if (!news) return

    // Check if this news was already viewed in localStorage
    const viewedNews = JSON.parse(localStorage.getItem('viewedNewsIds') || '[]')
    if (viewedNews.includes(news.id)) {
      return
    }

    // Check if user has dismissed news dialogs after this news was created
    const lastDismissedTimestamp = localStorage.getItem('newsDialogLastDismissed')
    if (lastDismissedTimestamp) {
      const dismissedTime = parseInt(lastDismissedTimestamp, 10)
      const newsCreatedTime = parseInt(news.createdAt, 10)

      // If the news was created before the last dismissal, don't show it
      if (newsCreatedTime <= dismissedTime) {
        return
      }
    }

    // Check if a dialog is already open to prevent multiple dialogs
    if (showDialog.value) {
      return
    }

    currentNews.value = news
    showDialog.value = true
  }

  const handleNewsRead = (newsId: string) => {
    // Add to localStorage
    const viewedNews = JSON.parse(localStorage.getItem('viewedNewsIds') || '[]')
    if (!viewedNews.includes(newsId)) {
      viewedNews.push(newsId)
      localStorage.setItem('viewedNewsIds', JSON.stringify(viewedNews))
    }

    // Store timestamp to prevent showing older news dialogs
    const timestamp = Date.now().toString()
    localStorage.setItem('newsDialogLastDismissed', timestamp)

    // Refetch queries to update counts with new timestamp
    refetchNews({ lastDismissedTimestamp: timestamp } as any)
    refetchCount()

    showDialog.value = false
    currentNews.value = null
  }

  const closeDialog = () => {
    // Store timestamp to prevent showing older news dialogs
    const timestamp = Date.now().toString()
    localStorage.setItem('newsDialogLastDismissed', timestamp)

    // Refetch to ensure no older news will be shown
    refetchNews({ lastDismissedTimestamp: timestamp } as any)

    showDialog.value = false
    currentNews.value = null
  }

  // Check for news on mount and when news data changes
  onMounted(() => {
    // Small delay to ensure the app is fully loaded
    setTimeout(checkAndShowNews, 1000)
  })

  // Watch for changes in news data
  watch(latestUnreadNews, (newNews) => {
    if (newNews) {
      checkAndShowNews()
    }
  })

  return {
    showDialog,
    currentNews,
    unreadCount,
    handleNewsRead,
    closeDialog,
    refetchCount,
  }
}
