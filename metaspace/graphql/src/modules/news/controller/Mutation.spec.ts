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

describe('modules/news/controller (mutations)', () => {
  let testNews1: News
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

    // Create a test news item
    const newsRepo = testEntityManager.getRepository(News)
    testNews1 = await newsRepo.save({
      title: 'Test News',
      content: '<p>Test content</p>',
      type: 'news',
      visibility: 'public',
      showOnHomePage: false,
      isVisible: true,
      createdBy: adminUser.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
  })

  afterEach(async() => {
    await onAfterEach()
  })

  describe('Mutation.recordNewsEvent', () => {
    const recordNewsEventMutation = `mutation($input: RecordNewsEventInput!) {
      recordNewsEvent(input: $input)
    }`

    it('should record a viewed event for authenticated user', async() => {
      const input = {
        newsId: testNews1.id,
        eventType: 'viewed',
      }

      const result = await doQuery(recordNewsEventMutation, { input })

      expect(result).toBe(true)

      // Verify event was recorded
      const event = await testEntityManager
        .getRepository(NewsEvent)
        .findOne({ where: { newsId: testNews1.id, userId: testUser.id, eventType: 'viewed' } })

      expect(event).toBeTruthy()
    })

    it('should record a clicked event for authenticated user', async() => {
      const input = {
        newsId: testNews1.id,
        eventType: 'clicked',
      }

      const result = await doQuery(recordNewsEventMutation, { input })

      expect(result).toBe(true)

      // Verify event was recorded
      const event = await testEntityManager
        .getRepository(NewsEvent)
        .findOne({ where: { newsId: testNews1.id, userId: testUser.id, eventType: 'clicked' } })

      expect(event).toBeTruthy()
    })

    it('should record a link_clicked event with URL', async() => {
      const input = {
        newsId: testNews1.id,
        eventType: 'link_clicked',
        linkUrl: 'https://example.com',
      }

      const result = await doQuery(recordNewsEventMutation, { input })

      expect(result).toBe(true)

      // Verify event was recorded with URL
      const event = await testEntityManager
        .getRepository(NewsEvent)
        .findOne({ where: { newsId: testNews1.id, userId: testUser.id, eventType: 'link_clicked' } })

      expect(event).toBeTruthy()
      expect(event?.linkUrl).toBe('https://example.com')
    })

    it('should work for anonymous users', async() => {
      const input = {
        newsId: testNews1.id,
        eventType: 'viewed',
      }

      const result = await doQuery(recordNewsEventMutation, { input }, { context: anonContext })

      expect(result).toBe(true)

      // Verify event was recorded with null userId
      const events = await testEntityManager
        .getRepository(NewsEvent)
        .find({ where: { newsId: testNews1.id, userId: null as any, eventType: 'viewed' } })

      expect(events.length).toBeGreaterThan(0)
    })

    it('should fail for non-existent news', async() => {
      const input = {
        newsId: '00000000-0000-0000-0000-000000000000',
        eventType: 'viewed',
      }

      await expect(
        doQuery(recordNewsEventMutation, { input })
      ).rejects.toThrow('News not found')
    })
  })

  describe('Mutation.createNews', () => {
    const createNewsMutation = `mutation($input: CreateNewsInput!) {
      createNews(input: $input) {
        id
        title
        content
        type
        visibility
        showOnHomePage
        isVisible
        showFrom
        showUntil
        createdBy
      }
    }`

    it('should create a public news item', async() => {
      const input = {
        title: 'New Public News',
        content: '<p>This is new public news with <a href="https://example.com">a link</a></p>',
        type: 'news',
        visibility: 'public',
        showOnHomePage: true,
      }

      const result = await doQuery(createNewsMutation, { input }, { context: adminContext })

      expect(result).toBeTruthy()
      expect(result.title).toBe('New Public News')
      expect(result.content).toBe('<p>This is new public news with <a href="https://example.com">a link</a></p>')
      expect(result.visibility).toBe('public')
      expect(result.showOnHomePage).toBe(true)
      expect(result.createdBy).toBe(adminUser.id)

      // Verify news was created in database
      const news = await testEntityManager.getRepository(News).findOne({ where: { id: result.id } })
      expect(news).toBeTruthy()
    })

    it('should create news for logged users', async() => {
      const input = {
        title: 'Logged Users News',
        content: '<p>This is for logged users</p>',
        type: 'message',
        visibility: 'logged_users',
        showOnHomePage: false,
      }

      const result = await doQuery(createNewsMutation, { input }, { context: adminContext })

      expect(result).toBeTruthy()
      expect(result.visibility).toBe('logged_users')
    })

    it('should create news for specific users', async() => {
      const input = {
        title: 'Specific Users News',
        content: '<p>This is for specific users</p>',
        type: 'system_notification',
        visibility: 'specific_users',
        targetUserIds: [testUser.id],
      }

      const result = await doQuery(createNewsMutation, { input }, { context: adminContext })

      expect(result).toBeTruthy()
      expect(result.visibility).toBe('specific_users')

      // Verify target user was created
      const targetUser = await testEntityManager
        .getRepository(NewsTargetUser)
        .findOne({ where: { newsId: result.id, userId: testUser.id } })

      expect(targetUser).toBeTruthy()
    })

    it('should deny access to non-admin users', async() => {
      const input = {
        title: 'New News',
        content: '<p>Content</p>',
        type: 'news',
        visibility: 'logged_users',
      }

      await expect(
        doQuery(createNewsMutation, { input })
      ).rejects.toThrow('Access denied: Admin role required')
    })

    it('should validate required title', async() => {
      const input = {
        title: '',
        content: '<p>Content</p>',
        type: 'news',
        visibility: 'logged_users',
      }

      await expect(
        doQuery(createNewsMutation, { input }, { context: adminContext })
      ).rejects.toThrow('Title is required')
    })

    it('should validate required content', async() => {
      const input = {
        title: 'Title',
        content: '',
        type: 'news',
        visibility: 'logged_users',
      }

      await expect(
        doQuery(createNewsMutation, { input }, { context: adminContext })
      ).rejects.toThrow('Content is required')
    })

    it('should validate target users for specific_users visibility', async() => {
      const input = {
        title: 'Specific Users News',
        content: '<p>Content</p>',
        type: 'news',
        visibility: 'specific_users',
      }

      await expect(
        doQuery(createNewsMutation, { input }, { context: adminContext })
      ).rejects.toThrow('Target users are required when visibility is set to specific_users')
    })

    it('should trim whitespace from title and content', async() => {
      const input = {
        title: '  Trimmed Title  ',
        content: '  <p>Trimmed Content</p>  ',
        type: 'news',
        visibility: 'logged_users',
      }

      const result = await doQuery(createNewsMutation, { input }, { context: adminContext })

      expect(result.title).toBe('Trimmed Title')
      expect(result.content).toBe('<p>Trimmed Content</p>')
    })
  })

  describe('Mutation.updateNews', () => {
    const updateNewsMutation = `mutation($id: ID!, $input: UpdateNewsInput!) {
      updateNews(id: $id, input: $input) {
        id
        title
        content
        type
        visibility
        showOnHomePage
        isVisible
      }
    }`

    it('should update news title', async() => {
      const input = {
        title: 'Updated Title',
      }

      const result = await doQuery(
        updateNewsMutation,
        { id: testNews1.id, input },
        { context: adminContext }
      )

      expect(result.title).toBe('Updated Title')
      expect(result.content).toBe(testNews1.content) // Other fields unchanged
    })

    it('should update news content', async() => {
      const input = {
        content: '<p>Updated content</p>',
      }

      const result = await doQuery(
        updateNewsMutation,
        { id: testNews1.id, input },
        { context: adminContext }
      )

      expect(result.content).toBe('<p>Updated content</p>')
    })

    it('should update multiple fields', async() => {
      const input = {
        title: 'Updated Title',
        content: '<p>Updated HTML content with <a href="https://updated.example.com">link</a></p>',
        type: 'message',
        showOnHomePage: true,
      }

      const result = await doQuery(
        updateNewsMutation,
        { id: testNews1.id, input },
        { context: adminContext }
      )

      expect(result.title).toBe('Updated Title')
      expect(result.content).toBe('<p>Updated HTML content with <a href="https://updated.example.com">link</a></p>')
      expect(result.type).toBe('message')
      expect(result.showOnHomePage).toBe(true)
    })

    it('should update visibility and target users', async() => {
      const input = {
        visibility: 'specific_users',
        targetUserIds: [testUser.id],
      }

      const result = await doQuery(
        updateNewsMutation,
        { id: testNews1.id, input },
        { context: adminContext }
      )

      expect(result.visibility).toBe('specific_users')

      // Verify target user was created
      const targetUser = await testEntityManager
        .getRepository(NewsTargetUser)
        .findOne({ where: { newsId: testNews1.id, userId: testUser.id } })

      expect(targetUser).toBeTruthy()
    })

    it('should deny access to non-admin users', async() => {
      const input = {
        title: 'Updated Title',
      }

      await expect(
        doQuery(updateNewsMutation, { id: testNews1.id, input })
      ).rejects.toThrow('Access denied: Admin role required')
    })

    it('should fail for non-existent news', async() => {
      const input = {
        title: 'Updated Title',
      }

      await expect(
        doQuery(
          updateNewsMutation,
          { id: '00000000-0000-0000-0000-000000000000', input },
          { context: adminContext }
        )
      ).rejects.toThrow('News not found')
    })

    it('should validate empty title', async() => {
      const input = {
        title: '',
      }

      await expect(
        doQuery(updateNewsMutation, { id: testNews1.id, input }, { context: adminContext })
      ).rejects.toThrow('Title cannot be empty')
    })

    it('should validate empty content', async() => {
      const input = {
        content: '',
      }

      await expect(
        doQuery(updateNewsMutation, { id: testNews1.id, input }, { context: adminContext })
      ).rejects.toThrow('Content cannot be empty')
    })

    it('should validate target users when changing to specific_users', async() => {
      const input = {
        visibility: 'specific_users',
        targetUserIds: [],
      }

      await expect(
        doQuery(updateNewsMutation, { id: testNews1.id, input }, { context: adminContext })
      ).rejects.toThrow('Target users are required when visibility is set to specific_users')
    })
  })

  describe('Mutation.deleteNews', () => {
    const deleteNewsMutation = `mutation($id: ID!) {
      deleteNews(id: $id)
    }`

    it('should soft delete news', async() => {
      const result = await doQuery(
        deleteNewsMutation,
        { id: testNews1.id },
        { context: adminContext }
      )

      expect(result).toBe(true)

      // Verify news was soft deleted
      const news = await testEntityManager.getRepository(News).findOne({ where: { id: testNews1.id } })
      expect(news).toBeTruthy()
      expect(news?.deletedAt).toBeTruthy()
    })

    it('should deny access to non-admin users', async() => {
      await expect(
        doQuery(deleteNewsMutation, { id: testNews1.id })
      ).rejects.toThrow('Access denied: Admin role required')
    })

    it('should fail for non-existent news', async() => {
      await expect(
        doQuery(
          deleteNewsMutation,
          { id: '00000000-0000-0000-0000-000000000000' },
          { context: adminContext }
        )
      ).rejects.toThrow('News not found')
    })

    it('should fail for already deleted news', async() => {
      // Delete news first
      await doQuery(deleteNewsMutation, { id: testNews1.id }, { context: adminContext })

      // Try to delete again
      await expect(
        doQuery(deleteNewsMutation, { id: testNews1.id }, { context: adminContext })
      ).rejects.toThrow('News not found')
    })
  })

  describe('Mutation.updateNews (visibility control)', () => {
    const updateNewsMutation = `mutation($id: ID!, $input: UpdateNewsInput!) {
      updateNews(id: $id, input: $input) {
        id
        title
        content
        type
        visibility
        showOnHomePage
        isVisible
      }
    }`

    it('should hide news using updateNews', async() => {
      const input = {
        isVisible: false,
      }

      const result = await doQuery(
        updateNewsMutation,
        { id: testNews1.id, input },
        { context: adminContext }
      )

      expect(result.isVisible).toBe(false)

      // Verify in database
      const news = await testEntityManager.getRepository(News).findOne({ where: { id: testNews1.id } })
      expect(news?.isVisible).toBe(false)
    })

    it('should show news using updateNews', async() => {
      // First hide the news
      testNews1.isVisible = false
      await testEntityManager.getRepository(News).save(testNews1)

      const input = {
        isVisible: true,
      }

      const result = await doQuery(
        updateNewsMutation,
        { id: testNews1.id, input },
        { context: adminContext }
      )

      expect(result.isVisible).toBe(true)

      // Verify in database
      const news = await testEntityManager.getRepository(News).findOne({ where: { id: testNews1.id } })
      expect(news?.isVisible).toBe(true)
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle concurrent event recording', async() => {
      const recordNewsEventMutation = `mutation($input: RecordNewsEventInput!) {
        recordNewsEvent(input: $input)
      }`

      const input = {
        newsId: testNews1.id,
        eventType: 'viewed',
      }

      // Record multiple events concurrently
      const promises = Array(5).fill(null).map(() =>
        doQuery(recordNewsEventMutation, { input })
      )

      const results = await Promise.all(promises)

      expect(results.every(r => r === true)).toBe(true)

      // Verify all events were recorded
      const events = await testEntityManager
        .getRepository(NewsEvent)
        .find({ where: { newsId: testNews1.id, userId: testUser.id, eventType: 'viewed' } })

      expect(events.length).toBe(5)
    })

    it('should handle updating target users when removing specific_users visibility', async() => {
      // First create news with specific users
      const createNewsMutation = `mutation($input: CreateNewsInput!) {
        createNews(input: $input) {
          id
          visibility
        }
      }`

      const createInput = {
        title: 'Specific Users News',
        content: '<p>Content</p>',
        type: 'news',
        visibility: 'specific_users',
        targetUserIds: [testUser.id],
      }

      const created = await doQuery(createNewsMutation, { input: createInput }, { context: adminContext })

      // Now update to public visibility
      const updateNewsMutation = `mutation($id: ID!, $input: UpdateNewsInput!) {
        updateNews(id: $id, input: $input) {
          id
          visibility
        }
      }`

      const updateInput = {
        visibility: 'public',
        targetUserIds: [],
      }

      const updated = await doQuery(
        updateNewsMutation,
        { id: created.id, input: updateInput },
        { context: adminContext }
      )

      expect(updated.visibility).toBe('public')

      // Verify target users were removed
      const targetUsers = await testEntityManager
        .getRepository(NewsTargetUser)
        .find({ where: { newsId: created.id } })

      expect(targetUsers).toHaveLength(0)
    })
  })

  describe('New Visibility Options', () => {
    const createNewsMutation = `mutation($input: CreateNewsInput!) {
      createNews(input: $input) {
        id
        title
        content
        type
        visibility
        showOnHomePage
        isVisible
        showFrom
        showUntil
        createdBy
      }
    }`

    // Mock the API request for pro groups
    const mockApiRequest = jest.fn()

    beforeEach(() => {
      // Mock the makeApiRequest function
      jest.doMock('node-fetch', () => jest.fn())
      mockApiRequest.mockClear()
    })

    it('should create news for pro users visibility', async() => {
      // Mock the pro-groups API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pro Group 1' },
            { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Pro Group 2' },
          ],
        }),
      })

      const input = {
        title: 'Pro Users News',
        content: '<p>This is for pro users only</p>',
        type: 'news',
        visibility: 'pro_users',
        showOnHomePage: false,
      }

      const result = await doQuery(createNewsMutation, { input }, { context: adminContext })

      expect(result).toBeTruthy()
      expect(result.visibility).toBe('pro_users')
    })

    it('should create news for non-pro users visibility', async() => {
      // Mock the pro-groups API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pro Group 1' },
            { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Pro Group 2' },
          ],
        }),
      })

      const input = {
        title: 'Non-Pro Users News',
        content: '<p>This is for non-pro users only</p>',
        type: 'news',
        visibility: 'non_pro_users',
        showOnHomePage: false,
      }

      const result = await doQuery(createNewsMutation, { input }, { context: adminContext })

      expect(result).toBeTruthy()
      expect(result.visibility).toBe('non_pro_users')
    })

    it('should create news with visibility except (blacklist)', async() => {
      const input = {
        title: 'Visibility Except News',
        content: '<p>This is for all users except blacklisted ones</p>',
        type: 'news',
        visibility: 'visibility_except',
        blacklistUserIds: [testUser.id],
      }

      const result = await doQuery(createNewsMutation, { input }, { context: adminContext })

      expect(result).toBeTruthy()
      expect(result.visibility).toBe('visibility_except')

      // Verify blacklist user was created
      const blacklistUser = await testEntityManager
        .getRepository(NewsBlacklistUser)
        .findOne({ where: { newsId: result.id, userId: testUser.id } })

      expect(blacklistUser).toBeTruthy()
    })

    it('should fail when visibility_except is selected without blacklist users', async() => {
      const input = {
        title: 'Invalid Visibility Except News',
        content: '<p>This should fail</p>',
        type: 'news',
        visibility: 'visibility_except',
        blacklistUserIds: [],
      }

      await expect(
        doQuery(createNewsMutation, { input }, { context: adminContext })
      ).rejects.toThrow('Blacklist users are required when visibility is set to visibility_except')
    })
  })

  describe('Date-based Visibility', () => {
    const createNewsMutation = `mutation($input: CreateNewsInput!) {
      createNews(input: $input) {
        id
        title
        content
        type
        visibility
        showOnHomePage
        isVisible
        showFrom
        showUntil
        createdBy
      }
    }`

    it('should create news with show from date', async() => {
      const futureDate = utc().add(1, 'day').toISOString()
      const input = {
        title: 'Future News',
        content: '<p>This news will appear tomorrow</p>',
        type: 'news',
        visibility: 'public',
        showFrom: futureDate,
      }

      const result = await doQuery(createNewsMutation, { input }, { context: adminContext })

      expect(result).toBeTruthy()
      expect(result.showFrom).toBe(futureDate)
      expect(result.showUntil).toBeNull()
    })

    it('should create news with show until date', async() => {
      const futureDate = utc().add(7, 'days').toISOString()
      const input = {
        title: 'Expiring News',
        content: '<p>This news will expire in a week</p>',
        type: 'news',
        visibility: 'public',
        showUntil: futureDate,
      }

      const result = await doQuery(createNewsMutation, { input }, { context: adminContext })

      expect(result).toBeTruthy()
      expect(result.showFrom).toBeNull()
      expect(result.showUntil).toBe(futureDate)
    })

    it('should create news with both show from and show until dates', async() => {
      const fromDate = utc().add(1, 'day').toISOString()
      const untilDate = utc().add(7, 'days').toISOString()
      const input = {
        title: 'Time Window News',
        content: '<p>This news has a specific time window</p>',
        type: 'news',
        visibility: 'public',
        showFrom: fromDate,
        showUntil: untilDate,
      }

      const result = await doQuery(createNewsMutation, { input }, { context: adminContext })

      expect(result).toBeTruthy()
      expect(result.showFrom).toBe(fromDate)
      expect(result.showUntil).toBe(untilDate)
    })

    it('should fail when show from date is after show until date', async() => {
      const fromDate = utc().add(7, 'days').toISOString()
      const untilDate = utc().add(1, 'day').toISOString()
      const input = {
        title: 'Invalid Date Range News',
        content: '<p>This should fail</p>',
        type: 'news',
        visibility: 'public',
        showFrom: fromDate,
        showUntil: untilDate,
      }

      await expect(
        doQuery(createNewsMutation, { input }, { context: adminContext })
      ).rejects.toThrow('Show from date must be before show until date')
    })

    it('should reject same dates for from and until', async() => {
      const sameDate = utc().add(1, 'day').toISOString()
      const input = {
        title: 'Same Date News',
        content: '<p>This has the same from and until date</p>',
        type: 'news',
        visibility: 'public',
        showFrom: sameDate,
        showUntil: sameDate,
      }

      await expect(
        doQuery(createNewsMutation, { input }, { context: adminContext })
      ).rejects.toThrow('Show from date must be before show until date')
    })
  })

  describe('Update News with New Features', () => {
    const createNewsMutation = `mutation($input: CreateNewsInput!) {
      createNews(input: $input) {
        id
        title
        content
        type
        visibility
        showOnHomePage
        isVisible
        showFrom
        showUntil
        createdBy
      }
    }`

    const updateNewsMutation = `mutation($id: ID!, $input: UpdateNewsInput!) {
      updateNews(id: $id, input: $input) {
        id
        title
        content
        visibility
        showFrom
        showUntil
      }
    }`

    it('should update news to add blacklist users', async() => {
      // First create a news item
      const createInput = {
        title: 'Test News for Update',
        content: '<p>Original content</p>',
        type: 'news',
        visibility: 'logged_users',
      }

      const created = await doQuery(createNewsMutation, { input: createInput }, { context: adminContext })

      // Then update it to use blacklist
      const updateInput = {
        visibility: 'visibility_except',
        blacklistUserIds: [testUser.id],
      }

      const updated = await doQuery(
        updateNewsMutation,
        { id: created.id, input: updateInput },
        { context: adminContext }
      )

      expect(updated.visibility).toBe('visibility_except')

      // Verify blacklist user was created
      const blacklistUser = await testEntityManager
        .getRepository(NewsBlacklistUser)
        .findOne({ where: { newsId: created.id, userId: testUser.id } })

      expect(blacklistUser).toBeTruthy()
    })

    it('should update news to add date constraints', async() => {
      // First create a news item
      const createInput = {
        title: 'Test News for Date Update',
        content: '<p>Original content</p>',
        type: 'news',
        visibility: 'public',
      }

      const created = await doQuery(createNewsMutation, { input: createInput }, { context: adminContext })

      // Then update it to add dates
      const fromDate = utc().add(1, 'hour').toISOString()
      const untilDate = utc().add(1, 'week').toISOString()
      const updateInput = {
        showFrom: fromDate,
        showUntil: untilDate,
      }

      const updated = await doQuery(
        updateNewsMutation,
        { id: created.id, input: updateInput },
        { context: adminContext }
      )

      expect(updated.showFrom).toBe(fromDate)
      expect(updated.showUntil).toBe(untilDate)
    })

    it('should update news to remove date constraints', async() => {
      // First create a news item with dates
      const fromDate = utc().add(1, 'hour').toISOString()
      const untilDate = utc().add(1, 'week').toISOString()
      const createInput = {
        title: 'Test News with Dates',
        content: '<p>Content with dates</p>',
        type: 'news',
        visibility: 'public',
        showFrom: fromDate,
        showUntil: untilDate,
      }

      const created = await doQuery(createNewsMutation, { input: createInput }, { context: adminContext })

      // Then update it to remove dates
      const updateInput = {
        showFrom: null,
        showUntil: null,
      }

      const updated = await doQuery(
        updateNewsMutation,
        { id: created.id, input: updateInput },
        { context: adminContext }
      )

      expect(updated.showFrom).toBeNull()
      expect(updated.showUntil).toBeNull()
    })
  })
})
