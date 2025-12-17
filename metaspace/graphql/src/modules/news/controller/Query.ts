import { Context } from '../../../context'
import logger from '../../../utils/logger'
import { FieldResolversFor } from '../../../bindingTypes'
import { Query } from '../../../binding'
import { News, NewsEvent } from '../model'
import * as crypto from 'crypto'

interface NewsFilterInput {
  type?: string;
  visibility?: string;
  showOnHomePage?: boolean;
  isVisible?: boolean;
  createdBy?: string | number;
  startDate?: string;
  endDate?: string;
  hasViewed?: boolean;
  hasClicked?: boolean;
}

const buildNewsQuery = (
  context: Context,
  filter: NewsFilterInput = {},
  includeDeleted = false
) => {
  const { entityManager, user } = context
  const queryBuilder = entityManager
    .getRepository(News)
    .createQueryBuilder('news')

  // Default: exclude deleted news
  if (!includeDeleted) {
    queryBuilder.andWhere('news.deleted_at IS NULL')
  }

  const isAdmin = user.role === 'admin'

  // Visibility filtering based on user permissions
  if (!isAdmin) {
    if (!user.id) {
      // Anonymous users can only see public news
      queryBuilder.andWhere('news.visibility = :visibility', { visibility: 'public' })
    } else {
      // Logged-in users can see public and logged_users news
      queryBuilder.andWhere('(news.visibility IN (:...visibilities) OR news.id IN '
        + '(SELECT news_id FROM public.news_target_user WHERE user_id = :userId))', {
        visibilities: ['public', 'logged_users'],
        userId: user.id,
      })
    }

    // Non-admin users can only see visible news
    queryBuilder.andWhere('news.is_visible = :isVisible', { isVisible: true })
  }

  // Apply filters
  if (filter.type) {
    queryBuilder.andWhere('news.type = :type', { type: filter.type })
  }

  if (filter.visibility) {
    queryBuilder.andWhere('news.visibility = :visibility', { visibility: filter.visibility })
  }

  if (filter.showOnHomePage !== undefined) {
    queryBuilder.andWhere('news.show_on_home_page = :showOnHomePage', { showOnHomePage: filter.showOnHomePage })
  }

  if (filter.isVisible !== undefined && isAdmin) {
    queryBuilder.andWhere('news.is_visible = :isVisible', { isVisible: filter.isVisible })
  }

  if (filter.createdBy) {
    queryBuilder.andWhere('news.created_by = :createdBy', { createdBy: filter.createdBy })
  }

  if (filter.startDate) {
    queryBuilder.andWhere('news.created_at >= :startDate', { startDate: filter.startDate })
  }

  if (filter.endDate) {
    queryBuilder.andWhere('news.created_at <= :endDate', { endDate: filter.endDate })
  }

  // Filter by read/unread status - works for both authenticated and anonymous users
  if (filter.hasViewed !== undefined) {
    if (user.id) {
      // For authenticated users, filter by user_id
      if (filter.hasViewed) {
        queryBuilder.andWhere('news.id IN (SELECT DISTINCT news_id FROM public.news_event WHERE '
          + 'user_id = :userId AND event_type = :eventType)', {
          userId: user.id,
          eventType: 'viewed',
        })
      } else {
        queryBuilder.andWhere('news.id NOT IN (SELECT DISTINCT news_id FROM public.news_event WHERE '
          + 'user_id = :userId AND event_type = :eventType)', {
          userId: user.id,
          eventType: 'viewed',
        })
      }
    } else {
      // For anonymous users, filter by hashed_ip
      const hashedIp = getHashedIp(context)
      if (filter.hasViewed) {
        queryBuilder.andWhere('news.id IN (SELECT DISTINCT news_id FROM public.news_event WHERE '
          + 'hashed_ip = :hashedIp AND event_type = :eventType)', {
          hashedIp,
          eventType: 'viewed',
        })
      } else {
        queryBuilder.andWhere('news.id NOT IN (SELECT DISTINCT news_id FROM public.news_event WHERE '
          + 'hashed_ip = :hashedIp AND event_type = :eventType)', {
          hashedIp,
          eventType: 'viewed',
        })
      }
    }
  }

  // Filter by clicked status - works for both authenticated and anonymous users
  if (filter.hasClicked !== undefined) {
    if (user.id) {
      // For authenticated users, filter by user_id
      if (filter.hasClicked) {
        queryBuilder.andWhere('news.id IN (SELECT DISTINCT news_id FROM public.news_event WHERE '
          + 'user_id = :userId AND event_type = :eventType)', {
          userId: user.id,
          eventType: 'clicked',
        })
      } else {
        queryBuilder.andWhere('news.id NOT IN (SELECT DISTINCT news_id FROM public.news_event WHERE '
          + 'user_id = :userId AND event_type = :eventType)', {
          userId: user.id,
          eventType: 'clicked',
        })
      }
    } else {
      // For anonymous users, filter by hashed_ip
      const hashedIp = getHashedIp(context)
      if (filter.hasClicked) {
        queryBuilder.andWhere('news.id IN (SELECT DISTINCT news_id FROM public.news_event WHERE '
          + 'hashed_ip = :hashedIp AND event_type = :eventType)', {
          hashedIp,
          eventType: 'clicked',
        })
      } else {
        queryBuilder.andWhere('news.id NOT IN (SELECT DISTINCT news_id FROM public.news_event WHERE '
          + 'hashed_ip = :hashedIp AND event_type = :eventType)', {
          hashedIp,
          eventType: 'clicked',
        })
      }
    }
  }

  return queryBuilder
}

const enrichNewsWithUserData = async(context: Context, newsList: News[]) => {
  if (newsList.length === 0) {
    return newsList.map(news => ({
      ...news,
      hasViewed: false,
      hasClicked: false,
      viewCount: 0,
      clickCount: 0,
    }))
  }

  const newsIds = newsList.map(n => n.id)
  const { entityManager, user } = context

  // Get user/client events for these news
  let userEvents: NewsEvent[]
  if (user.id) {
    // For authenticated users, filter by user_id
    userEvents = await entityManager
      .getRepository(NewsEvent)
      .createQueryBuilder('event')
      .where('event.news_id IN (:...newsIds)', { newsIds })
      .andWhere('event.user_id = :userId', { userId: user.id })
      .getMany()
  } else {
    // For anonymous users, filter by hashed_ip
    const hashedIp = getHashedIp(context)
    userEvents = await entityManager
      .getRepository(NewsEvent)
      .createQueryBuilder('event')
      .where('event.news_id IN (:...newsIds)', { newsIds })
      .andWhere('event.hashed_ip = :hashedIp', { hashedIp })
      .getMany()
  }

  // Get total counts for all news
  const eventCounts = await entityManager
    .getRepository(NewsEvent)
    .createQueryBuilder('event')
    .select('event.news_id', 'newsId')
    .addSelect('event.event_type', 'eventType')
    .addSelect('COUNT(*)', 'count')
    .where('event.news_id IN (:...newsIds)', { newsIds })
    .groupBy('event.news_id')
    .addGroupBy('event.event_type')
    .getRawMany()

  const userEventsByNews = userEvents.reduce((acc, event) => {
    if (!acc[event.newsId]) {
      acc[event.newsId] = { viewed: false, clicked: false }
    }
    if (event.eventType === 'viewed') acc[event.newsId].viewed = true
    if (event.eventType === 'clicked' || event.eventType === 'link_clicked') acc[event.newsId].clicked = true
    return acc
  }, {} as Record<string, { viewed: boolean; clicked: boolean }>)

  const countsByNews = eventCounts.reduce((acc, row) => {
    if (!acc[row.newsId]) {
      acc[row.newsId] = { viewCount: 0, clickCount: 0 }
    }
    if (row.eventType === 'viewed') {
      acc[row.newsId].viewCount = parseInt(row.count, 10)
    }
    if (row.eventType === 'clicked' || row.eventType === 'link_clicked') {
      acc[row.newsId].clickCount += parseInt(row.count, 10)
    }
    return acc
  }, {} as Record<string, { viewCount: number; clickCount: number }>)

  return newsList.map(news => ({
    ...news,
    hasViewed: userEventsByNews[news.id]?.viewed || false,
    hasClicked: userEventsByNews[news.id]?.clicked || false,
    viewCount: countsByNews[news.id]?.viewCount || 0,
    clickCount: countsByNews[news.id]?.clickCount || 0,
  }))
}

const getHashedIp = (ctx: Context): string => {
  let ip = ctx.req?.ip || ctx.req?.headers?.['x-forwarded-for'] || ctx.req?.connection?.remoteAddress || 'unknown'
  // Handle case where x-forwarded-for is an array
  if (Array.isArray(ip)) {
    ip = ip[0]
  }
  return crypto.createHash('sha256').update(ip).digest('hex')
}

const QueryResolvers: FieldResolversFor<Query, void> = {
  async news(_: any, { id }: any, ctx: Context): Promise<any> {
    try {
      const queryBuilder = buildNewsQuery(ctx, {}, false)
      queryBuilder.andWhere('news.id = :id', { id })

      const news = await queryBuilder.getOne()

      if (!news) {
        return null
      }

      const enrichedNews = await enrichNewsWithUserData(ctx, [news])
      return enrichedNews[0]
    } catch (error) {
      logger.error(`Error fetching news with ID ${id}:`, error)
      return null
    }
  },

  async allNews(_: any, args: any, ctx: Context): Promise<any> {
    try {
      const { orderBy = 'ORDER_BY_CREATED_AT', sortingOrder = 'DESCENDING', filter = {}, offset = 0, limit = 20 } = args

      const queryBuilder = buildNewsQuery(ctx, filter, false)

      // Apply sorting
      const orderDirection = sortingOrder === 'DESCENDING' ? 'DESC' : 'ASC'
      switch (orderBy) {
        case 'ORDER_BY_TITLE':
          queryBuilder.orderBy('news.title', orderDirection)
          break
        case 'ORDER_BY_UPDATED_AT':
          queryBuilder.orderBy('news.updated_at', orderDirection)
          break
        case 'ORDER_BY_CREATED_AT':
        default:
          queryBuilder.orderBy('news.created_at', orderDirection)
          break
      }

      // Get total count
      const total = await queryBuilder.getCount()

      // Apply pagination
      queryBuilder.skip(offset).take(limit)

      const newsList = await queryBuilder.getMany()
      const enrichedNews = await enrichNewsWithUserData(ctx, newsList)

      return {
        news: enrichedNews,
        total,
        offset,
        limit,
      }
    } catch (error) {
      logger.error('Error fetching all news:', error)
      return {
        news: [],
        total: 0,
        offset: args.offset || 0,
        limit: args.limit || 20,
      }
    }
  },

  async latestUnreadNews(_: any, { limit = 5 }: any, ctx: Context): Promise<any> {
    try {
      const filter: NewsFilterInput = {
        hasViewed: false,
      }

      const queryBuilder = buildNewsQuery(ctx, filter, false)
      queryBuilder.orderBy('news.created_at', 'DESC').take(limit)

      const newsList = await queryBuilder.getMany()
      const enrichedNews = await enrichNewsWithUserData(ctx, newsList)

      return enrichedNews
    } catch (error) {
      logger.error('Error fetching latest unread news:', error)
      return []
    }
  },

  async newsForHomePage(_: any, { limit = 5 }: any, ctx: Context): Promise<any> {
    try {
      const filter: NewsFilterInput = {
        showOnHomePage: true,
      }

      const queryBuilder = buildNewsQuery(ctx, filter, false)
      queryBuilder.orderBy('news.created_at', 'DESC').take(limit)

      const newsList = await queryBuilder.getMany()
      const enrichedNews = await enrichNewsWithUserData(ctx, newsList)

      return enrichedNews
    } catch (error) {
      logger.error('Error fetching news for home page:', error)
      return []
    }
  },

  async newsCount(_: any, { filter = {} }: any, ctx: Context): Promise<number> {
    try {
      const queryBuilder = buildNewsQuery(ctx, filter, false)
      return await queryBuilder.getCount()
    } catch (error) {
      logger.error('Error fetching news count:', error)
      return 0
    }
  },

  async latestUnreadNewsForDialog(_: any, args: any, ctx: Context): Promise<any> {
    try {
      const { lastDismissedTimestamp } = args

      const filter: NewsFilterInput = {
        hasViewed: false,
        showOnHomePage: true,
      }

      const queryBuilder = buildNewsQuery(ctx, filter, false)

      // If lastDismissedTimestamp is provided, only show news created after that timestamp
      if (lastDismissedTimestamp) {
        queryBuilder.andWhere('news.created_at > :lastDismissedTimestamp', {
          lastDismissedTimestamp: new Date(parseInt(lastDismissedTimestamp, 10)),
        })
      }

      queryBuilder.orderBy('news.created_at', 'DESC').take(1)

      const newsList = await queryBuilder.getMany()
      if (newsList.length === 0) {
        return null
      }

      const enrichedNews = await enrichNewsWithUserData(ctx, newsList)
      return enrichedNews[0]
    } catch (error) {
      logger.error('Error fetching latest unread news for dialog:', error)
      return null
    }
  },

  async unreadNewsCount(_: any, args: any, ctx: Context): Promise<number> {
    try {
      const filter: NewsFilterInput = {
        hasViewed: false,
        showOnHomePage: true,
      }

      const queryBuilder = buildNewsQuery(ctx, filter, false)
      return await queryBuilder.getCount()
    } catch (error) {
      logger.error('Error fetching unread news count:', error)
      return 0
    }
  },
}

export default QueryResolvers
