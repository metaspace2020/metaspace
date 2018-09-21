import {Column, Entity, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {Group} from '../group/model';
import {User} from '../user/model';

@Entity()
export class Dataset {

  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', name: 'user_id' })
  userId: string; // dataset submitter and owner -> edit rights

  @ManyToOne(type => User, user => user.datasets)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', name: 'group_id', nullable: true })
  groupId: string; // dataset belongs to group -> all members have view rights

  @ManyToOne(type => Group)
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ default: false })
  approved: boolean; // true when submitter is a group member
}
