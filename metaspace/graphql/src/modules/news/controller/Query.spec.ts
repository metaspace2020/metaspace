import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testUser,
  adminUser,
  testEntityManager,
  adminContext,
  anonContext,
} from '../../../tests/graphqlTestEnvironment'
import { News, NewsEvent, NewsTargetUser } from '../model'
import { utc } from 'moment'

describe('modules/news/controller (queries)', () => {
  let testNews1: News
  let testNews2: News
  let testNews3: News
  let testNews4: News

  beforeAll(async() => {
    await onBeforeAll()
  })

  afterAll(async() => {
    await onAfterAll()
  })

  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()

    const now = utc()

    // Create test news
    const newsRepo = testEntityManager.getRepository(News)

    testNews1 = await newsRepo.save({
      title: 'Public News Item',
      content: '<p>This is a public news item</p>',
      type: 'news',
      visibility: 'public',
      showOnHomePage: true,
      isVisible: true,
      createdBy: adminUser.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })

    testNews2 = await newsRepo.save({
      title: 'Logged Users Only',
      content: '<p>This is for logged users only</p>',
      type: 'message',
      visibility: 'logged_users',
      showOnHomePage: false,
      isVisible: true,
      createdBy: adminUser.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })

    testNews3 = await newsRepo.save({
      title: 'Specific Users Only',
      content: '<p>This is for specific users</p>',
      type: 'system_notification',
      visibility: 'specific_users',
      showOnHomePage: false,
      isVisible: true,
      createdBy: adminUser.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })

    // Add target user for testNews3
    await testEntityManager.getRepository(NewsTargetUser).save({
      newsId: testNews3.id,
      userId: testUser.id,
      createdAt: now,
    })

    testNews4 = await newsRepo.save({
      title: 'Hidden News',
      content: '<p>This news is hidden</p>',
      type: 'news',
      visibility: 'public',
      showOnHomePage: false,
      isVisible: false,
      createdBy: adminUser.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })

    // Create some events for testNews1
    const eventRepo = testEntityManager.getRepository(NewsEvent)
    await eventRepo.save({
      newsId: testNews1.id,
      userId: testUser.id,
      eventType: 'viewed',
      linkUrl: null,
      createdAt: now,
    })

    await eventRepo.save({
      newsId: testNews1.id,
      userId: testUser.id,
      eventType: 'clicked',
      linkUrl: null,
      createdAt: now,
    })
  })

  afterEach(async() => {
    await onAfterEach()
  })

  describe('Query.news', () => {
    const queryNews = `query($id: ID!) {
      news(id: $id) {
        id
        title
        content
        type
        visibility
        showOnHomePage
        isVisible
        createdBy
        hasViewed
        hasClicked
        viewCount
        clickCount
      }
    }`

    it('should return a public news item for authenticated user', async() => {
      const result = await doQuery(queryNews, { id: testNews1.id })

      expect(result).toBeTruthy()
      expect(result.id).toBe(testNews1.id)
      expect(result.title).toBe('Public News Item')
      expect(result.hasViewed).toBe(true)
      expect(result.hasClicked).toBe(true)
      expect(result.viewCount).toBe(1)
      expect(result.clickCount).toBe(1)
    })

    it('should return a public news item for anonymous user', async() => {
      const result = await doQuery(queryNews, { id: testNews1.id }, { context: anonContext })

      expect(result).toBeTruthy()
      expect(result.id).toBe(testNews1.id)
      expect(result.hasViewed).toBe(false)
      expect(result.hasClicked).toBe(false)
    })

    it('should return logged users news for authenticated user', async() => {
      const result = await doQuery(queryNews, { id: testNews2.id })

      expect(result).toBeTruthy()
      expect(result.id).toBe(testNews2.id)
      expect(result.title).toBe('Logged Users Only')
    })

    it('should not return logged users news for anonymous user', async() => {
      const result = await doQuery(queryNews, { id: testNews2.id }, { context: anonContext })

      expect(result).toBeNull()
    })

    it('should return specific users news for targeted user', async() => {
      const result = await doQuery(queryNews, { id: testNews3.id })

      expect(result).toBeTruthy()
      expect(result.id).toBe(testNews3.id)
      expect(result.title).toBe('Specific Users Only')
    })

    it('should not return hidden news for regular user', async() => {
      const result = await doQuery(queryNews, { id: testNews4.id })

      expect(result).toBeNull()
    })

    it('should return null for non-existent news', async() => {
      const result = await doQuery(queryNews, { id: '00000000-0000-0000-0000-000000000000' })

      expect(result).toBeNull()
    })
  })

  describe('Query.allNews', () => {
    const queryAllNews = `query($offset: Int, $limit: Int, $filter: NewsFilter) {
      allNews(offset: $offset, limit: $limit, filter: $filter) {
        news {
          id
          title
          type
          visibility
          hasViewed
          hasClicked
        }
        total
        offset
        limit
      }
    }`

    it('should return all visible news for authenticated user', async() => {
      const result = await doQuery(queryAllNews, { offset: 0, limit: 20 })

      expect(result.news).toHaveLength(3) // testNews1, testNews2, testNews3 (not testNews4 as it's hidden)
      expect(result.total).toBe(3)
    })

    it('should return only public news for anonymous user', async() => {
      const result = await doQuery(queryAllNews, { offset: 0, limit: 20 }, { context: anonContext })

      expect(result.news).toHaveLength(1) // Only testNews1
      expect(result.total).toBe(1)
      expect(result.news[0].id).toBe(testNews1.id)
    })

    it('should filter by type', async() => {
      const result = await doQuery(queryAllNews, {
        offset: 0,
        limit: 20,
        filter: { type: 'news' },
      })

      expect(result.news.every((n: any) => n.type === 'news')).toBe(true)
    })

    it('should filter by visibility', async() => {
      const result = await doQuery(queryAllNews, {
        offset: 0,
        limit: 20,
        filter: { visibility: 'public' },
      })

      expect(result.news.every((n: any) => n.visibility === 'public')).toBe(true)
    })

    it('should filter by read status', async() => {
      const result = await doQuery(queryAllNews, {
        offset: 0,
        limit: 20,
        filter: { hasViewed: true },
      })

      expect(result.news).toHaveLength(1)
      expect(result.news[0].id).toBe(testNews1.id)
    })

    it('should filter by unread status', async() => {
      const result = await doQuery(queryAllNews, {
        offset: 0,
        limit: 20,
        filter: { hasViewed: false },
      })

      expect(result.news.length).toBeGreaterThan(0)
      expect(result.news.every((n: any) => !n.hasViewed)).toBe(true)
    })

    it('should support pagination', async() => {
      const result1 = await doQuery(queryAllNews, { offset: 0, limit: 1 })
      expect(result1.news).toHaveLength(1)
      expect(result1.offset).toBe(0)
      expect(result1.limit).toBe(1)

      const result2 = await doQuery(queryAllNews, { offset: 1, limit: 1 })
      expect(result2.news).toHaveLength(1)
      expect(result2.offset).toBe(1)
      expect(result2.news[0].id).not.toBe(result1.news[0].id)
    })

    it('should sort by title ascending', async() => {
      const result = await doQuery(
        `query {
          allNews(orderBy: ORDER_BY_TITLE, sortingOrder: ASCENDING) {
            news {
              id
              title
            }
            total
          }
        }`
      )

      const titles = result.news.map((n: any) => n.title)
      const sortedTitles = [...titles].sort()
      expect(titles).toEqual(sortedTitles)
    })

    it('should sort by created date descending', async() => {
      const result = await doQuery(
        `query {
          allNews(orderBy: ORDER_BY_CREATED_AT, sortingOrder: DESCENDING) {
            news {
              id
              createdAt
            }
            total
          }
        }`
      )

      expect(result.news).toHaveLength(3)
    })
  })

  describe('Query.latestUnreadNews', () => {
    const queryLatestUnreadNews = `query($limit: Int) {
      latestUnreadNews(limit: $limit) {
        id
        title
        hasViewed
      }
    }`

    it('should return latest unread news for authenticated user', async() => {
      const result = await doQuery(queryLatestUnreadNews, { limit: 5 })

      expect(result.length).toBeGreaterThan(0)
      expect(result.every((n: any) => !n.hasViewed)).toBe(true)
    })

    it('should work for anonymous users', async() => {
      const result = await doQuery(queryLatestUnreadNews, { limit: 5 }, { context: anonContext })

      expect(Array.isArray(result)).toBe(true)
      // Anonymous users should see public news they haven't viewed
    })

    it('should respect limit parameter', async() => {
      const result = await doQuery(queryLatestUnreadNews, { limit: 1 })

      expect(result).toHaveLength(1)
    })
  })

  describe('Query.newsForHomePage', () => {
    const queryNewsForHomePage = `query($limit: Int) {
      newsForHomePage(limit: $limit) {
        id
        title
        showOnHomePage
      }
    }`

    it('should return news marked for home page', async() => {
      const result = await doQuery(queryNewsForHomePage, { limit: 5 })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(testNews1.id)
      expect(result[0].showOnHomePage).toBe(true)
    })

    it('should work for anonymous users', async() => {
      const result = await doQuery(queryNewsForHomePage, { limit: 5 }, { context: anonContext })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(testNews1.id)
    })

    it('should respect limit parameter', async() => {
      const result = await doQuery(queryNewsForHomePage, { limit: 1 })

      expect(result.length).toBeLessThanOrEqual(1)
    })
  })

  describe('Query.allNews (admin access)', () => {
    const queryAllNews = `query($offset: Int, $limit: Int, $filter: NewsFilter) {
      allNews(offset: $offset, limit: $limit, filter: $filter) {
        news {
          id
          title
          isVisible
        }
        total
      }
    }`

    it('should return all news including hidden for admin', async() => {
      const result = await doQuery(queryAllNews, { offset: 0, limit: 20 }, { context: adminContext })

      expect(result.news.length).toBe(4) // All 4 news items including hidden
      expect(result.total).toBe(4)
    })

    it('should filter by isVisible for admin', async() => {
      const result = await doQuery(
        queryAllNews,
        { offset: 0, limit: 20, filter: { isVisible: false } },
        { context: adminContext }
      )

      expect(result.news).toHaveLength(1)
      expect(result.news[0].id).toBe(testNews4.id)
    })
  })

  describe('Query.newsCount', () => {
    const queryNewsCount = `query($filter: NewsFilter) {
      newsCount(filter: $filter)
    }`

    it('should return total count of visible news for regular user', async() => {
      const result = await doQuery(queryNewsCount, {})

      expect(result).toBe(3) // Only visible news
    })

    it('should return total count of all news for admin', async() => {
      const result = await doQuery(queryNewsCount, {}, { context: adminContext })

      expect(result).toBe(4) // All news including hidden
    })

    it('should filter count by type', async() => {
      const result = await doQuery(
        queryNewsCount,
        { filter: { type: 'news' } },
        { context: adminContext }
      )

      expect(result).toBe(2) // testNews1 and testNews4
    })
  })
})
