import { FieldResolversFor, ScopeRole } from '../../../bindingTypes'
import { ProjectSponsorship } from '../../../binding'
import { Context } from '../../../context'
import { Group as GroupModel } from '../../group/model'
import { resolveGroupScopeRole } from '../../group/util/resolveGroupScopeRole'
import { ProjectSponsorshipSource } from './Query'

const ProjectSponsorshipResolvers: FieldResolversFor<ProjectSponsorship, ProjectSponsorshipSource> = {
  /** The sponsoring Pro group with the viewer's scope role, or null if the group no longer exists. */
  async proGroup({ proGroupId }, args, ctx: Context): Promise<(GroupModel & { scopeRole: ScopeRole }) | null> {
    const group = await ctx.entityManager.getRepository(GroupModel).findOne(proGroupId)
    if (group == null) {
      return null
    }
    const scopeRole = await resolveGroupScopeRole(ctx, proGroupId)
    return { ...group, scopeRole }
  },
}

export default ProjectSponsorshipResolvers
