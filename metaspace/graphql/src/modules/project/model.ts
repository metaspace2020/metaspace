import {
  Entity,
  PrimaryColumn,
  Column,
  JoinColumn,
  OneToMany,
  ManyToOne,
  Index,
} from 'typeorm'

import { User } from '../user/model'
import { UserProjectRole, PublicationStatus } from '../../binding'
import { DatasetProject } from '../dataset/model'
import { Moment } from 'moment'
import { MomentValueTransformer } from '../../utils/MomentValueTransformer'
import { PublicationStatusOptions as PSO } from './Publishing'
import { ExternalLink } from './ExternalLink'

export const UserProjectRoleOptions: Record<UserProjectRole, UserProjectRole> = {
  INVITED: 'INVITED',
  PENDING: 'PENDING',
  MEMBER: 'MEMBER',
  MANAGER: 'MANAGER',
  REVIEWER: 'REVIEWER',
}

@Entity()
export class Project {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  urlSlug: string | null;

  @OneToMany(() => UserProject, userProject => userProject.project)
  members: UserProject[];

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean;

  @OneToMany(() => DatasetProject, datasetProject => datasetProject.project)
  datasetProjects: DatasetProject[];

  @Column({
    name: 'created_dt', type: 'timestamp without time zone', transformer: new MomentValueTransformer(),
  })
  createdDT: Moment;

  @Column({ type: 'text', nullable: true, name: 'project_description' })
  projectDescription: string | null;

  @Column({ type: 'text', nullable: true })
  reviewToken: string | null;

  @Column({ type: 'timestamp without time zone', nullable: true, transformer: new MomentValueTransformer() })
  reviewTokenCreatedDT: Moment | null;

  @Column({ type: 'int', default: 0 })
  publishNotificationsSent: number;

  @Column({ type: 'text', enum: Object.keys(PSO), default: PSO.UNPUBLISHED })
  publicationStatus: PublicationStatus;

  @Column({ type: 'timestamp without time zone', nullable: true, transformer: new MomentValueTransformer() })
  publishedDT: Moment | null;

  @Column({ type: 'json', nullable: true })
  externalLinks: ExternalLink[] | null;
}

@Entity('user_project')
export class UserProject {
  @PrimaryColumn({ type: 'text' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @PrimaryColumn({ type: 'text' })
  projectId: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ type: 'text', enum: Object.keys(UserProjectRoleOptions) })
  role: UserProjectRole;
}

export const PROJECT_ENTITIES = [
  Project,
  UserProject,
]
