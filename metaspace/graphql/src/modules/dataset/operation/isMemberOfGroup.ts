import { EntityManager } from 'typeorm'
import { UserGroup as UserGroupModel, UserGroupRoleOptions as UGRO } from '../../group/model'

export const isMemberOfGroup = async(entityManager: EntityManager, userId: string, groupId: string) => {
  const userGroup = await entityManager.findOne(UserGroupModel, {
    userId,
    groupId,
  })
  let isMember = false
  if (userGroup) {
    isMember = [UGRO.MEMBER, UGRO.GROUP_ADMIN].includes(userGroup.role)
  }
  return isMember
}
