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

  @Column({ type: 'text', name: 'short_name' })
  shortName: string;

  @Column({ type: 'text', name: 'url_slug', nullable: true })
  urlSlug: string | null;

  @OneToMany(type => UserGroup, userGroup => userGroup.group)
  members: UserGroup[];
}

@Entity('user_group')
export class UserGroup {

  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(type => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @PrimaryColumn({ type: 'uuid', name: 'group_id' })
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
