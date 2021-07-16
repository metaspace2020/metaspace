import { UserError } from 'graphql-errors'

import { Context } from '../../../context'

export const assertUserBelongsToGroup = async(ctx: Context, groupId: string) => {
  ctx.getUserIdOrFail() // Exit early if not logged in

  if (ctx.isAdmin) {
    return
  }

  const groupIds = await ctx.user.getMemberOfGroupIds()
  if (!groupIds.includes(groupId)) {
    throw new UserError('Unauthorized')
  }
}
