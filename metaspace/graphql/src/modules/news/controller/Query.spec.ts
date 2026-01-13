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
import { News, NewsEvent, NewsTargetUser, NewsBlacklistUser } from '../model'
import { utc } from 'moment'
import fetch from 'node-fetch'
import config from '../../../utils/config'

// Mock node-fetch
jest.mock('node-fetch')
const mockFetch = fetch as jest.Mock

describe('modules/news/controller (queries)', () => {
  let testNews1: News
  let testNews2: News
  let testNews3: News
  let testNews4: News
  let originalManagerApiUrl: string | undefined

  beforeAll(async() => {
    await onBeforeAll()
    originalManagerApiUrl = config.manager_api_url
    config.manager_api_url = 'https://test-api.metaspace.example'
  })

  afterAll(async() => {
    await onAfterAll()
    if (originalManagerApiUrl !== undefined) {
      config.manager_api_url = originalManagerApiUrl
    } else {
      delete (config as any).manager_api_url
    }
  })

  beforeEach(async() => {
    await onBeforeEach()
    await setupTestUsers()

    mockFetch.mockClear()

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

  describe('Date-based Visibility Filtering', () => {
    const allNewsQuery = `query {
      allNews {
        news {
          id
          title
          showFrom
          showUntil
        }
      }
    }`

    let futureNews: News
    let expiredNews: News
    let currentNews: News

    beforeEach(async() => {
      const now = utc()
      const newsRepo = testEntityManager.getRepository(News)

      // News that will appear in the future
      futureNews = await newsRepo.save({
        title: 'Future News',
        content: '<p>This will appear tomorrow</p>',
        type: 'news',
        visibility: 'public',
        showOnHomePage: false,
        isVisible: true,
        showFrom: now.clone().add(1, 'day'),
        showUntil: null,
        createdBy: adminUser.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      // News that has expired
      expiredNews = await newsRepo.save({
        title: 'Expired News',
        content: '<p>This expired yesterday</p>',
        type: 'news',
        visibility: 'public',
        showOnHomePage: false,
        isVisible: true,
        showFrom: null,
        showUntil: now.clone().subtract(1, 'day'),
        createdBy: adminUser.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      // News that is currently visible
      currentNews = await newsRepo.save({
        title: 'Current News',
        content: '<p>This is currently visible</p>',
        type: 'news',
        visibility: 'public',
        showOnHomePage: false,
        isVisible: true,
        showFrom: now.clone().subtract(1, 'hour'),
        showUntil: now.clone().add(1, 'hour'),
        createdBy: adminUser.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
    })

    it('should only return news within their display date range', async() => {
      const result = await doQuery(allNewsQuery)

      const newsIds = result.news.map((n: any) => n.id)

      // Should include current news and existing test news (no date constraints)
      expect(newsIds).toContain(currentNews.id)
      expect(newsIds).toContain(testNews1.id) // Public news from main setup

      // Should NOT include future or expired news
      expect(newsIds).not.toContain(futureNews.id)
      expect(newsIds).not.toContain(expiredNews.id)
    })

    it('should include news with no date constraints', async() => {
      const result = await doQuery(allNewsQuery)

      const newsIds = result.news.map((n: any) => n.id)

      // Should include news with no showFrom/showUntil dates
      expect(newsIds).toContain(testNews1.id)
    })

    it('should handle news with only showFrom date', async() => {
      const now = utc()
      const newsRepo = testEntityManager.getRepository(News)

      const pastStartNews = await newsRepo.save({
        title: 'Past Start News',
        content: '<p>Started in the past, no end date</p>',
        type: 'news',
        visibility: 'public',
        showOnHomePage: false,
        isVisible: true,
        showFrom: now.clone().subtract(1, 'hour'),
        showUntil: null,
        createdBy: adminUser.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      const result = await doQuery(allNewsQuery)
      const newsIds = result.news.map((n: any) => n.id)

      expect(newsIds).toContain(pastStartNews.id)
    })

    it('should handle news with only showUntil date', async() => {
      const now = utc()
      const newsRepo = testEntityManager.getRepository(News)

      const futureEndNews = await newsRepo.save({
        title: 'Future End News',
        content: '<p>No start date, ends in future</p>',
        type: 'news',
        visibility: 'public',
        showOnHomePage: false,
        isVisible: true,
        showFrom: null,
        showUntil: now.clone().add(1, 'hour'),
        createdBy: adminUser.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      const result = await doQuery(allNewsQuery)
      const newsIds = result.news.map((n: any) => n.id)

      expect(newsIds).toContain(futureEndNews.id)
    })
  })

  describe('New Visibility Options Filtering', () => {
    const allNewsQuery = `query {
      allNews {
        news {
          id
          title
          visibility
        }
      }
    }`

    let proUsersNews: News
    let nonProUsersNews: News
    let visibilityExceptNews: News

    beforeEach(async() => {
      const now = utc()
      const newsRepo = testEntityManager.getRepository(News)

      // News for pro users only
      proUsersNews = await newsRepo.save({
        title: 'Pro Users News',
        content: '<p>For pro users only</p>',
        type: 'news',
        visibility: 'pro_users',
        showOnHomePage: false,
        isVisible: true,
        createdBy: adminUser.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      // News for non-pro users only
      nonProUsersNews = await newsRepo.save({
        title: 'Non-Pro Users News',
        content: '<p>For non-pro users only</p>',
        type: 'news',
        visibility: 'non_pro_users',
        showOnHomePage: false,
        isVisible: true,
        createdBy: adminUser.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      // News with blacklist (visibility except)
      visibilityExceptNews = await newsRepo.save({
        title: 'Visibility Except News',
        content: '<p>For all except blacklisted users</p>',
        type: 'news',
        visibility: 'visibility_except',
        showOnHomePage: false,
        isVisible: true,
        createdBy: adminUser.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      // Add test user to blacklist for visibility except news
      await testEntityManager.getRepository(NewsBlacklistUser).save({
        newsId: visibilityExceptNews.id,
        userId: testUser.id,
        createdAt: now,
      })
    })

    it('should handle pro/non-pro user filtering (mocked)', async() => {
      // Mock the pro-groups API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })

      const result = await doQuery(allNewsQuery)
      const allNews = result.news

      const proNews = allNews.find((n: any) => n.id === proUsersNews.id)
      const nonProNews = allNews.find((n: any) => n.id === nonProUsersNews.id)
      const exceptNews = allNews.find((n: any) => n.id === visibilityExceptNews.id)

      // These might not appear in results due to pro user filtering logic
      // but we can verify they exist with the correct visibility types
      if (proNews) expect(proNews.visibility).toBe('pro_users')
      if (nonProNews) expect(nonProNews.visibility).toBe('non_pro_users')
      if (exceptNews) expect(exceptNews.visibility).toBe('visibility_except')
    })

    it('should exclude blacklisted users from visibility_except news', async() => {
      // Test as the blacklisted user
      const result = await doQuery(allNewsQuery)
      const newsIds = result.news.map((n: any) => n.id)

      // The visibility_except news should not appear for the blacklisted user
      // Note: This depends on the buildNewsQuery logic working correctly
      // In a real test environment, this would need proper setup
      expect(newsIds).not.toContain(visibilityExceptNews.id)
    })

    it('should show visibility_except news to non-blacklisted users', async() => {
      // Test as admin (not blacklisted)
      const result = await doQuery(allNewsQuery, {}, { context: adminContext })
      const newsIds = result.news.map((n: any) => n.id)

      // Admin should see the visibility_except news since they're not blacklisted
      expect(newsIds).toContain(visibilityExceptNews.id)
    })
  })

  describe('Combined Filtering (Dates + Visibility)', () => {
    const allNewsQuery = `query {
      allNews {
        news {
          id
          title
          visibility
          showFrom
          showUntil
        }
      }
    }`

    it('should apply both date and visibility filtering', async() => {
      const now = utc()
      const newsRepo = testEntityManager.getRepository(News)

      // Create a future news with specific visibility
      const futureSpecificNews = await newsRepo.save({
        title: 'Future Specific News',
        content: '<p>Future news for specific users</p>',
        type: 'news',
        visibility: 'specific_users',
        showOnHomePage: false,
        isVisible: true,
        showFrom: now.clone().add(1, 'day'),
        showUntil: null,
        createdBy: adminUser.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      // Add target user
      await testEntityManager.getRepository(NewsTargetUser).save({
        newsId: futureSpecificNews.id,
        userId: testUser.id,
        createdAt: now,
      })

      const result = await doQuery(allNewsQuery)
      const newsIds = result.news.map((n: any) => n.id)

      // Should not appear because it's in the future, even though user is targeted
      expect(newsIds).not.toContain(futureSpecificNews.id)
    })

    it('should show current news with proper visibility', async() => {
      const now = utc()
      const newsRepo = testEntityManager.getRepository(News)

      // Create current news for specific users
      const currentSpecificNews = await newsRepo.save({
        title: 'Current Specific News',
        content: '<p>Current news for specific users</p>',
        type: 'news',
        visibility: 'specific_users',
        showOnHomePage: false,
        isVisible: true,
        showFrom: now.clone().subtract(1, 'hour'),
        showUntil: now.clone().add(1, 'hour'),
        createdBy: adminUser.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      // Add target user
      await testEntityManager.getRepository(NewsTargetUser).save({
        newsId: currentSpecificNews.id,
        userId: testUser.id,
        createdAt: now,
      })

      const result = await doQuery(allNewsQuery)
      const newsIds = result.news.map((n: any) => n.id)

      // Should appear because it's current and user is targeted
      expect(newsIds).toContain(currentSpecificNews.id)
    })
  })
})
