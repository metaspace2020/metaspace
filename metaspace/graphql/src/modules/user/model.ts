import { Entity, PrimaryColumn, Column, OneToOne, JoinColumn, OneToMany } from 'typeorm'
import { Credentials } from '../auth/model'
import { UserGroup } from '../group/model'
import { Dataset } from '../dataset/model'
import { UserProject } from '../project/model'
import { Plan } from '../plan/model'

@Entity()
export class User {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text', nullable: true })
  name: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  notVerifiedEmail: string | null;

  @Column({ type: 'text', default: 'user' })
  role: 'admin' | 'user';

  @Column({ name: 'plan_id' })
  planId: number;

  @Column({ type: 'text' })
  credentialsId: string;

  @OneToOne(() => Credentials)
  @JoinColumn({ name: 'credentials_id' })
  credentials: Credentials;

  @OneToOne(() => Plan)
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  @OneToMany(() => Dataset, ds => ds.user)
  datasets: Dataset[];

  @OneToMany(() => UserGroup, userGroup => userGroup.user)
  groups?: UserGroup[];

  @OneToMany(() => UserProject, userProject => userProject.user)
  projects?: UserProject[];
}

export const USER_ENTITIES = [
  User,
]
