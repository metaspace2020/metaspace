import { Context } from '../../../context'
import { ApiUsage, Plan } from '../model'
import * as moment from 'moment'
import { DeepPartial } from 'typeorm'
import { UserError } from 'graphql-errors'
import { User } from '../../user/model'
import { UAParser } from 'ua-parser-js'
import * as CryptoJS from 'crypto-js'
import config from '../../../utils/config'

const canPerformAction = async(ctx: Context, action: DeepPartial<ApiUsage>) : Promise<boolean> => {
  const user: any = ctx?.user

  if (user?.role === 'admin') {
    return true
  }

  if (!user.plan) {
    const planId = user.planId
        || (await ctx.entityManager.findOneOrFail(User, user.id, { relations: ['plan'] })).planId

    user.plan = await ctx.entityManager.createQueryBuilder(Plan, 'plan')
      .leftJoinAndSelect('plan.planRules', 'planRules')
      .where('plan.id = :planId', { planId })
      .getOne()
  }

  if (!user.plan?.planRules) {
    return true
  }

  const planRules = user.plan?.planRules?.filter((rule: any) => rule.actionType === action.actionType
      && rule.type === action.type && (!rule.visibility || rule.visibility === action.visibility)
      && (!rule.source || rule.source === action.source))

  for (const rule of planRules as any[]) {
    const startDate = moment.utc().subtract(1, rule.periodType)
    const endDate = moment.utc().add(2, 'second') // add a slack of 2 seconds

    let qb = ctx.entityManager.createQueryBuilder(ApiUsage, 'usage')
      .where('usage.actionType = :actionType', { actionType: action.actionType })
      .andWhere('usage.actionDt >= :startDate', { startDate: startDate.toDate() })
      .andWhere('usage.actionDt <= :endDate', { endDate: endDate.toDate() })
      .andWhere('usage.userId = :userId', { userId: user.id })

    if (rule.visibility) {
      qb = qb.andWhere('usage.visibility = :visibility', { visibility: rule.visibility })
    }

    if (rule.source) {
      qb = qb.andWhere('usage.source = :source', { source: rule.source })
    }

    const usages = await qb.getMany()

    if (usages.length >= rule.limit) {
      return false
    }
  }

  return true
}

export const performAction = async(ctx: Context, action: DeepPartial<ApiUsage>) : Promise<ApiUsage> => {
  const usage = ctx.entityManager.create(ApiUsage, action)
  return await ctx.entityManager.save(usage)
}
export const assertCanPerformAction = async(ctx: Context, action: DeepPartial<ApiUsage>) : Promise<void> => {
  const canPerform = await canPerformAction(ctx, action)
  if (!canPerform) {
    throw new UserError('Limit reached')
  }
}

export const getDeviceInfo = (userAgent: string | undefined, email: string | null = null) => {
  try {
    const { browser, os, device } = UAParser(userAgent)
    return JSON.stringify({
      device,
      os,
      browser,
      email,
    })
  } catch (error) {
    return JSON.stringify({})
  }
}
export const hashIp = (ip: string|undefined): string|undefined => {
  if (!ip) return undefined
  const saltedIP = config.api.usage.salt + ip
  return CryptoJS.SHA256(saltedIP).toString(CryptoJS.enc.Hex)
}

export default canPerformAction
