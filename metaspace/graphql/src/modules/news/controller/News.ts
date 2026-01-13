import { FieldResolversFor } from '../../../bindingTypes'
import { News } from '../../../binding'

const NewsResolvers: FieldResolversFor<News, any> = {
  createdAt(news): string {
    return news.createdAt.toISOString()
  },

  updatedAt(news): string {
    return news.updatedAt.toISOString()
  },

  deletedAt(news): string | null {
    return news.deletedAt ? news.deletedAt.toISOString() : null
  },

  showFrom(news): string | null {
    return news.showFrom ? news.showFrom.toISOString() : null
  },

  showUntil(news): string | null {
    return news.showUntil ? news.showUntil.toISOString() : null
  },
}

export default NewsResolvers
