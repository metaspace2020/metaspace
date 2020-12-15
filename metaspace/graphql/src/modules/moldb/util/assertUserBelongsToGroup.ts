import { UserError } from 'graphql-errors';

import { Context } from '../../../context';

export const assertUserBelongsToGroup = (ctx: Context, groupId: string) => {
  ctx.getUserIdOrFail(); // Exit early if not logged in

  if (ctx.isAdmin) {
    return;
  }

  if (!ctx.user.groupIds || !ctx.user.groupIds.includes(groupId)) {
    throw new UserError(`Unauthorized`);
  }
};