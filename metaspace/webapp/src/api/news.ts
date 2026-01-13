import gql from 'graphql-tag'

export type NewsType = 'news' | 'message' | 'system_notification'
export type NewsVisibility =
  | 'public'
  | 'logged_users'
  | 'specific_users'
  | 'pro_users'
  | 'non_pro_users'
  | 'visibility_except'
export type NewsEventType = 'viewed' | 'clicked' | 'link_clicked'
export type NewsOrderBy = 'ORDER_BY_CREATED_AT' | 'ORDER_BY_UPDATED_AT' | 'ORDER_BY_TITLE'

export interface News {
  id: string
  title: string
  content: string
  type: NewsType
  visibility: NewsVisibility
  showOnHomePage: boolean
  isVisible: boolean
  showFrom: string | null
  showUntil: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  hasViewed: boolean
  hasClicked: boolean
  viewCount: number
  clickCount: number
}

export interface NewsFilter {
  type?: NewsType
  visibility?: NewsVisibility
  showOnHomePage?: boolean
  isVisible?: boolean
  hasViewed?: boolean
  hasClicked?: boolean
  createdBy?: string
  startDate?: string
  endDate?: string
}

export interface AllNewsInput {
  orderBy?: NewsOrderBy
  sortingOrder?: 'ASCENDING' | 'DESCENDING'
  filter?: NewsFilter
  offset?: number
  limit?: number
}

export interface AllNewsQuery {
  allNews: {
    news: News[]
    total: number
    offset: number
    limit: number
  }
}

export interface CreateNewsInput {
  title: string
  content: string
  type: NewsType
  visibility: NewsVisibility
  showOnHomePage?: boolean
  showFrom?: string
  showUntil?: string
  targetUserIds?: string[]
  blacklistUserIds?: string[]
}

export interface UpdateNewsInput {
  title?: string
  content?: string
  type?: NewsType
  visibility?: NewsVisibility
  showOnHomePage?: boolean
  isVisible?: boolean
  showFrom?: string
  showUntil?: string
  targetUserIds?: string[]
  blacklistUserIds?: string[]
}

export interface RecordNewsEventInput {
  newsId: string
  eventType: NewsEventType
  linkUrl?: string
}

const newsFragment = gql`
  fragment NewsFragment on News {
    id
    title
    content
    type
    visibility
    showOnHomePage
    isVisible
    showFrom
    showUntil
    createdAt
    updatedAt
    createdBy
    hasViewed
    hasClicked
    viewCount
    clickCount
  }
`

export const allNewsQuery = gql`
  query AllNews(
    $orderBy: NewsOrderBy = ORDER_BY_CREATED_AT
    $sortingOrder: SortingOrder = DESCENDING
    $filter: NewsFilter = {}
    $offset: Int = 0
    $limit: Int = 20
  ) {
    allNews(orderBy: $orderBy, sortingOrder: $sortingOrder, filter: $filter, offset: $offset, limit: $limit) {
      news {
        ...NewsFragment
      }
      total
      offset
      limit
    }
  }
  ${newsFragment}
`

export const createNewsMutation = gql`
  mutation CreateNews($input: CreateNewsInput!) {
    createNews(input: $input) {
      ...NewsFragment
    }
  }
  ${newsFragment}
`

export const updateNewsMutation = gql`
  mutation UpdateNews($id: ID!, $input: UpdateNewsInput!) {
    updateNews(id: $id, input: $input) {
      ...NewsFragment
    }
  }
  ${newsFragment}
`

export const deleteNewsMutation = gql`
  mutation DeleteNews($id: ID!) {
    deleteNews(id: $id)
  }
`

export const recordNewsEventMutation = gql`
  mutation RecordNewsEvent($input: RecordNewsEventInput!) {
    recordNewsEvent(input: $input)
  }
`

export const latestUnreadNewsForDialogQuery = gql`
  query LatestUnreadNewsForDialog($lastDismissedTimestamp: String) {
    latestUnreadNewsForDialog(lastDismissedTimestamp: $lastDismissedTimestamp) {
      ...NewsFragment
    }
  }
  ${newsFragment}
`

export const unreadNewsCountQuery = gql`
  query UnreadNewsCount {
    unreadNewsCount
  }
`
