import {Entity, PrimaryColumn, Column, OneToOne, JoinColumn, OneToMany, ManyToOne} from 'typeorm';
import {Credentials} from '../auth/model';
import {UserGroup, Group} from '../group/model';

@Entity()
export class User {

  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text', default: 'user' })
  role: string;

  @Column({ type: 'text', name: 'credentials_id' })
  credentialsId: string;

  @OneToOne(type => Credentials)
  @JoinColumn({ name: 'credentials_id' })
  credentials: Credentials;

  @OneToMany(type => Dataset, ds => ds.user)
  datasets: Dataset[];

  @OneToMany(type => UserGroup, userGroup => userGroup.user)
  groups: UserGroup[];
}

@Entity()
export class Dataset {

  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @ManyToOne(type => User, user => user.datasets)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', name: 'group_id', nullable: true })
  groupId: string;

  @ManyToOne(type => Group)
  @JoinColumn({ name: 'group_id' })
  group: Group;
}
