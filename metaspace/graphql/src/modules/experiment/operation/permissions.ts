import { UserError } from 'graphql-errors'
import { Context } from '../../../context'
import { UserProject, UserProjectRoleOptions as UPRO } from '../../project/model'

export async function assertCanAccessProject(
  ctx: Context, projectId: string, opts: { write: boolean }
): Promise<void> {
  if (ctx.user.id == null) throw new UserError('Not authenticated')
  if (ctx.user.role === 'admin') return

  const up = await ctx.entityManager.getRepository(UserProject)
    .findOne({ where: { userId: ctx.user.id, projectId } })

  if (!up) throw new UserError('Not authorized')

  const writeRoles = [UPRO.MEMBER, UPRO.MANAGER]
  const readRoles = [UPRO.MEMBER, UPRO.MANAGER, UPRO.REVIEWER]
  const allowed = opts.write ? writeRoles : readRoles
  if (!allowed.includes(up.role as any)) throw new UserError('Not authorized')
}
