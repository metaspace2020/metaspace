import {
  Entity,
  PrimaryColumn,
  Column,
  JoinColumn,
  OneToMany,
  ManyToOne,
} from 'typeorm'

import { User } from '../user/model'
import { UserGroupRole } from '../../binding'
import { MolecularDB } from '../moldb/model'

export const UserGroupRoleOptions: Record<UserGroupRole, UserGroupRole> = {
  INVITED: 'INVITED',
  PENDING: 'PENDING',
  MEMBER: 'MEMBER',
  GROUP_ADMIN: 'GROUP_ADMIN',
}

@Entity()
export class Group {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  shortName: string;

  @Column({ type: 'text', nullable: true })
  urlSlug: string | null;

  @Column({ type: 'text', name: 'group_description', default: '' })
  groupDescriptionAsHtml: string;

  @OneToMany(() => UserGroup, userGroup => userGroup.group)
  members: UserGroup[];

  @OneToMany(() => GroupDetectability, groupDetectability => groupDetectability.group)
  sources: GroupDetectability[];

  @OneToMany(() => MolecularDB, molecularDB => molecularDB.group)
  molecularDBs: MolecularDB[];
}

@Entity('user_group')
export class UserGroup {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @PrimaryColumn({ type: 'uuid' })
  groupId: string;

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ type: 'text', enum: ['INVITED'] })
  role: 'INVITED' |
    'PENDING' |
    'MEMBER' |
    'GROUP_ADMIN';

  @Column({ default: true })
  primary: boolean;
}
@Entity('group_detectability')
export class GroupDetectability {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @PrimaryColumn({ type: 'uuid' })
  groupId: string;

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ type: 'text', enum: ['EMBL'] })
  source: 'EMBL' |
    'ALL' |
    'INTERLAB';
}

export const GROUP_ENTITIES = [
  Group,
  UserGroup,
  GroupDetectability,
]
