import {
  Entity,
  PrimaryColumn,
  Column,
  JoinColumn,
  OneToMany,
  ManyToOne
} from 'typeorm';

import {User} from '../user/model';
import {UserGroupRole} from '../../binding'
import {MolecularDB} from "../moldb/model";

export const UserGroupRoleOptions: Record<UserGroupRole, UserGroupRole> = {
  INVITED: 'INVITED',
  PENDING: 'PENDING',
  MEMBER: 'MEMBER',
  GROUP_ADMIN: 'GROUP_ADMIN'
};

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

  @Column({ type: 'text', name: 'group_description', default: ''})
  groupDescriptionAsHtml: string;

  @OneToMany(type => UserGroup, userGroup => userGroup.group)
  members: UserGroup[];

  @OneToMany(type => MolecularDB, molecularDB => molecularDB.group)
  molecularDBs: MolecularDB[];
}

@Entity('user_group')
export class UserGroup {

  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @ManyToOne(type => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @PrimaryColumn({ type: 'uuid' })
  groupId: string;

  @ManyToOne(type => Group)
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


export const GROUP_ENTITIES = [
  Group,
  UserGroup,
];
