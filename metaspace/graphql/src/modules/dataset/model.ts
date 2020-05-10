import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { Group } from '../group/model';
import { User } from '../user/model';
import { Project } from '../project/model';
import { PublicationStatus } from '../../binding';
import { PublicationStatusOptions as PSO } from '../project/Publishing';
import { ExternalLink } from '../project/ExternalLink';

@Entity()
export class Dataset {

  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'uuid' })
  userId: string; // dataset submitter and owner -> edit rights

  @ManyToOne(type => User, user => user.datasets)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  groupId: string | null; // dataset belongs to group -> all members have view rights

  @ManyToOne(type => Group)
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ default: false })
  groupApproved: boolean; // true when submitter is a group member

  // when user manually inputs PI details
  @Column({ type: 'text', nullable: true })
  piName: string | null;

  @Column({ type: 'text', nullable: true })
  piEmail: string | null;

  @OneToMany(type => DatasetProject, datasetProject => datasetProject.dataset)
  datasetProjects: DatasetProject[];

  @Column({ type: 'json', nullable: true })
  externalLinks: ExternalLink[] | null;
}

@Entity({ name: 'dataset_project' })
export class DatasetProject {

  @PrimaryColumn({ type: 'text' })
  datasetId: string;

  @ManyToOne(type => Dataset)
  @JoinColumn({ name: 'dataset_id' })
  dataset: Dataset;

  @PrimaryColumn({ type: 'uuid' })
  projectId: string;

  @ManyToOne(type => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ type: 'boolean' })
  approved: Boolean;
}

export const DATASET_ENTITIES = [
  Dataset,
  DatasetProject,
];
