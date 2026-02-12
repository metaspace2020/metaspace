import { Context } from '../../../context'
import { UserError } from 'graphql-errors'
import logger from '../../../utils/logger'
import { FieldResolversFor } from '../../../bindingTypes'
import { Mutation } from '../../../binding'
import { News, NewsEvent, NewsTargetUser, NewsBlacklistUser } from '../model'
import { UserGroup } from '../../group/model'
import { In } from 'typeorm'
import { utc } from 'moment'
import * as crypto from 'crypto'
import config from '../../../utils/config'
import fetch, { RequestInit } from 'node-fetch'

// Helper function to make API requests to external manager API
const makeApiRequest = async(ctx: Context, endpoint: string, method = 'GET', body?: any) => {
  try {
    const apiUrl = config.manager_api_url
    const token = ctx.req?.headers?.authorization || ''

    if (!apiUrl) {
      logger.error('Manager API URL is not configured')
      throw new Error('Manager API URL is not configured')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers.Authorization = token
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(`${apiUrl}${endpoint}`, options)
    if (!response.ok) {
      const errorText = response.text ? await response.text() : 'Internal server error'
      logger.error(`API request failed with status ${response.status}: ${errorText}`)
      throw new Error(errorText)
    }

    if (method === 'DELETE') {
      return { success: true }
    }

    const responseData = await response.json()
    return responseData
  } catch (error) {
    logger.error(`Error making API request to ${endpoint}:`, error)
    throw error
  }
}

// Helper function to get pro users from API_external
const getProUsers = async(ctx: Context): Promise<string[]> => {
  try {
    // Get all active pro groups
    const proGroupsResponse = await makeApiRequest(ctx, '/api/pro-groups?isActive=true')

    if (!proGroupsResponse || !proGroupsResponse.data) {
      return []
    }

    // Extract group IDs from the API response
    const proGroupIds = proGroupsResponse.data.map((group: any) => group.id).filter(Boolean)

    if (proGroupIds.length === 0) {
      return []
    }

    // Query the user_group table to find users in these pro groups
    const userGroups = await ctx.entityManager
      .getRepository(UserGroup)
      .find({
        where: proGroupIds.length === 1
          ? { groupId: proGroupIds[0] }
          : { groupId: In(proGroupIds) },
        select: ['userId'],
      })

    // Extract unique user IDs
    const proUserIds = [...new Set(userGroups.map(ug => ug.userId))]
    return proUserIds
  } catch (error) {
    // logger.warn('Error fetching pro users:', error)
    return []
  }
}

const MutationResolvers: FieldResolversFor<Mutation, void> = {
  async recordNewsEvent(_: any, { input }: any, ctx: Context): Promise<boolean> {
    const { newsId, eventType, linkUrl } = input
    const { entityManager, user, req } = ctx

    // Check if news exists
    const news = await entityManager.getRepository(News).findOne({
      where: { id: newsId, deletedAt: null as any },
    })

    if (!news) {
      throw new UserError('News not found')
    }

    try {
      // Create event with either user_id or hashed_ip
      const hashedIp = !user.id
        ? (() => {
            let ip = req?.ip || req?.headers?.['x-forwarded-for'] || req?.connection?.remoteAddress || 'unknown'
            // Handle case where x-forwarded-for is an array
            if (Array.isArray(ip)) {
              ip = ip[0]
            }
            return crypto.createHash('sha256').update(ip).digest('hex')
          })()
        : null

      const event = entityManager.getRepository(NewsEvent).create({
        newsId,
        userId: user.id || null,
        hashedIp,
        eventType,
        linkUrl: linkUrl || null,
        createdAt: utc(),
      })

      await entityManager.getRepository(NewsEvent).save(event)

      logger.info(
        `News event recorded: ${eventType} for news ${newsId} by ${user.id ? `user ${user.id}` : 'anonymous'}`
      )
      return true
    } catch (error) {
      logger.error('Error recording news event:', error)
      throw new UserError('Failed to record news event')
    }
  },

  async createNews(_: any, { input }: any, ctx: Context): Promise<any> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied: Admin role required')
    }

    const {
      title, content, type, visibility, showOnHomePage, showFrom, showUntil, targetUserIds, blacklistUserIds,
    } = input
    const { entityManager, user } = ctx

    // Validate input
    if (!title || !title.trim()) {
      throw new UserError('Title is required')
    }

    if (title.trim().length > 100) {
      throw new UserError('Title must be 100 characters or less')
    }

    if (!content || !content.trim()) {
      throw new UserError('Content is required')
    }

    // For content, we need to extract plain text from the rich text JSON to check length
    const extractPlainText = (content: string): string => {
      try {
        const parsed = JSON.parse(content)
        if (!parsed || typeof parsed !== 'object') {
          return content
        }

        const extractTextFromNode = (node: any): string => {
          if (node.text) {
            return node.text
          }
          if (node.content && Array.isArray(node.content)) {
            return node.content.map(extractTextFromNode).join(' ')
          }
          return ''
        }

        return extractTextFromNode(parsed)
      } catch {
        return content
      }
    }

    const plainTextContent = extractPlainText(content.trim())
    if (plainTextContent.length > 1500) {
      throw new UserError('Content must be 1500 characters or less')
    }

    if (!type) {
      throw new UserError('Type is required')
    }

    if (!visibility) {
      throw new UserError('Visibility is required')
    }

    // If visibility is specific_users, targetUserIds must be provided
    if (visibility === 'specific_users' && (!targetUserIds || targetUserIds.length === 0)) {
      throw new UserError('Target users are required when visibility is set to specific_users')
    }

    // If visibility is visibility_except, blacklistUserIds must be provided
    if (visibility === 'visibility_except' && (!blacklistUserIds || blacklistUserIds.length === 0)) {
      throw new UserError('Blacklist users are required when visibility is set to visibility_except')
    }

    // Validate date range if both dates are provided
    if (showFrom && showUntil) {
      const fromDate = utc(showFrom)
      const untilDate = utc(showUntil)
      if (fromDate.isSameOrAfter(untilDate)) {
        throw new UserError('Show from date must be before show until date')
      }
    }

    try {
      const now = utc()

      // Create news
      const news = entityManager.getRepository(News).create({
        title: title.trim(),
        content: content.trim(),
        type,
        visibility,
        showOnHomePage: showOnHomePage || false,
        isVisible: true,
        showFrom: showFrom ? utc(showFrom) : null,
        showUntil: showUntil ? utc(showUntil) : null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      await entityManager.getRepository(News).save(news)

      // If specific users are targeted, create target user records
      if (visibility === 'specific_users' && targetUserIds && targetUserIds.length > 0) {
        const targetUsers = targetUserIds.map((userId: string) =>
          entityManager.getRepository(NewsTargetUser).create({
            newsId: news.id,
            userId,
            createdAt: now,
          })
        )

        await entityManager.getRepository(NewsTargetUser).save(targetUsers)
      }

      // Handle pro_users visibility - get pro users and add them as target users
      if (visibility === 'pro_users') {
        const proUserIds = await getProUsers(ctx)
        if (proUserIds.length > 0) {
          const targetUsers = proUserIds.map((userId: string) =>
            entityManager.getRepository(NewsTargetUser).create({
              newsId: news.id,
              userId,
              createdAt: now,
            })
          )

          await entityManager.getRepository(NewsTargetUser).save(targetUsers)
        }
      }

      // If blacklist users are specified, create blacklist user records
      if (blacklistUserIds && blacklistUserIds.length > 0) {
        const blacklistUsers = blacklistUserIds.map((userId: string) =>
          entityManager.getRepository(NewsBlacklistUser).create({
            newsId: news.id,
            userId,
            createdAt: now,
          })
        )

        await entityManager.getRepository(NewsBlacklistUser).save(blacklistUsers)
      }

      logger.info(`News created with ID ${news.id} by admin ${user.id}`)

      return {
        ...news,
        hasViewed: false,
        hasClicked: false,
        viewCount: 0,
        clickCount: 0,
      }
    } catch (error) {
      logger.error('Error creating news:', error)
      throw new UserError('Failed to create news')
    }
  },

  async updateNews(_: any, { id, input }: any, ctx: Context): Promise<any> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied: Admin role required')
    }

    const { entityManager } = ctx

    // Find existing news
    const news = await entityManager.getRepository(News).findOne({
      where: { id, deletedAt: null as any },
    })

    if (!news) {
      throw new UserError('News not found')
    }

    // Validate input
    if (input.title !== undefined && (!input.title || !input.title.trim())) {
      throw new UserError('Title cannot be empty')
    }

    if (input.title !== undefined && input.title.trim().length > 100) {
      throw new UserError('Title must be 100 characters or less')
    }

    if (input.content !== undefined && (!input.content || !input.content.trim())) {
      throw new UserError('Content cannot be empty')
    }

    if (input.content !== undefined) {
      // For content, we need to extract plain text from the rich text JSON to check length
      const extractPlainText = (content: string): string => {
        try {
          const parsed = JSON.parse(content)
          if (!parsed || typeof parsed !== 'object') {
            return content
          }

          const extractTextFromNode = (node: any): string => {
            if (node.text) {
              return node.text
            }
            if (node.content && Array.isArray(node.content)) {
              return node.content.map(extractTextFromNode).join(' ')
            }
            return ''
          }

          return extractTextFromNode(parsed)
        } catch {
          return content
        }
      }

      const plainTextContent = extractPlainText(input.content.trim())
      if (plainTextContent.length > 1500) {
        throw new UserError('Content must be 1500 characters or less')
      }
    }

    // If visibility is being changed to specific_users, targetUserIds must be provided
    if (input.visibility === 'specific_users' && (!input.targetUserIds || input.targetUserIds.length === 0)) {
      throw new UserError('Target users are required when visibility is set to specific_users')
    }

    // If visibility is being changed to visibility_except, blacklistUserIds must be provided
    if (input.visibility === 'visibility_except'
        && (!input.blacklistUserIds || input.blacklistUserIds.length === 0)) {
      throw new UserError('Blacklist users are required when visibility is set to visibility_except')
    }

    // Validate date range if both dates are provided
    const showFromDate = input.showFrom !== undefined
      ? (input.showFrom
          ? utc(input.showFrom)
          : null)
      : news.showFrom
    const showUntilDate = input.showUntil !== undefined
      ? (input.showUntil
          ? utc(input.showUntil)
          : null)
      : news.showUntil
    if (showFromDate && showUntilDate && showFromDate.isSameOrAfter(showUntilDate)) {
      throw new UserError('Show from date must be before show until date')
    }

    try {
      // Update news fields
      if (input.title !== undefined) news.title = input.title.trim()
      if (input.content !== undefined) news.content = input.content.trim()
      if (input.type !== undefined) news.type = input.type
      if (input.visibility !== undefined) news.visibility = input.visibility
      if (input.showOnHomePage !== undefined) news.showOnHomePage = input.showOnHomePage
      if (input.isVisible !== undefined) news.isVisible = input.isVisible
      if (input.showFrom !== undefined) news.showFrom = input.showFrom ? utc(input.showFrom) : null
      if (input.showUntil !== undefined) news.showUntil = input.showUntil ? utc(input.showUntil) : null

      news.updatedAt = utc()

      await entityManager.getRepository(News).save(news)

      // Handle target users update
      if (input.targetUserIds !== undefined || news.visibility === 'pro_users') {
        // Remove existing target users
        await entityManager.getRepository(NewsTargetUser).delete({ newsId: id })

        // Add new target users based on visibility type
        if (news.visibility === 'specific_users' && input.targetUserIds && input.targetUserIds.length > 0) {
          const targetUsers = input.targetUserIds.map((userId: string) =>
            entityManager.getRepository(NewsTargetUser).create({
              newsId: id,
              userId,
              createdAt: utc(),
            })
          )

          await entityManager.getRepository(NewsTargetUser).save(targetUsers)
        } else if (news.visibility === 'pro_users') {
          // Handle pro_users visibility - get pro users and add them as target users
          const proUserIds = await getProUsers(ctx)
          if (proUserIds.length > 0) {
            const targetUsers = proUserIds.map((userId: string) =>
              entityManager.getRepository(NewsTargetUser).create({
                newsId: id,
                userId,
                createdAt: utc(),
              })
            )

            await entityManager.getRepository(NewsTargetUser).save(targetUsers)
          }
        }
      }

      // Handle blacklist users update
      if (input.blacklistUserIds !== undefined) {
        // Remove existing blacklist users
        await entityManager.getRepository(NewsBlacklistUser).delete({ newsId: id })

        // Add new blacklist users if provided
        if (input.blacklistUserIds.length > 0) {
          const blacklistUsers = input.blacklistUserIds.map((userId: string) =>
            entityManager.getRepository(NewsBlacklistUser).create({
              newsId: id,
              userId,
              createdAt: utc(),
            })
          )

          await entityManager.getRepository(NewsBlacklistUser).save(blacklistUsers)
        }
      }

      logger.info(`News updated with ID ${id} by admin ${ctx.user.id}`)

      // Fetch counts for response
      const viewCount = await entityManager
        .getRepository(NewsEvent)
        .count({ where: { newsId: id, eventType: 'viewed' } })

      const clickCount = await entityManager
        .getRepository(NewsEvent)
        .createQueryBuilder('event')
        .where('event.news_id = :newsId', { newsId: id })
        .andWhere('event.event_type IN (:...types)', { types: ['clicked', 'link_clicked'] })
        .getCount()

      return {
        ...news,
        hasViewed: false,
        hasClicked: false,
        viewCount,
        clickCount,
      }
    } catch (error) {
      logger.error(`Error updating news with ID ${id}:`, error)
      throw new UserError('Failed to update news')
    }
  },

  async deleteNews(_: any, { id }: any, ctx: Context): Promise<boolean> {
    if (ctx.user.role !== 'admin') {
      throw new UserError('Access denied: Admin role required')
    }

    const { entityManager } = ctx

    // Find existing news
    const news = await entityManager.getRepository(News).findOne({
      where: { id, deletedAt: null as any },
    })

    if (!news) {
      throw new UserError('News not found')
    }

    try {
      // Soft delete by setting deletedAt
      news.deletedAt = utc()
      news.updatedAt = utc()

      await entityManager.getRepository(News).save(news)

      logger.info(`News deleted with ID ${id} by admin ${ctx.user.id}`)
      return true
    } catch (error) {
      logger.error(`Error deleting news with ID ${id}:`, error)
      throw new UserError('Failed to delete news')
    }
  },

}

export default MutationResolvers
