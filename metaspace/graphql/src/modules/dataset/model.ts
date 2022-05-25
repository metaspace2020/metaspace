import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryColumn } from 'typeorm'
import { Group } from '../group/model'
import { User } from '../user/model'
import { Project } from '../project/model'
import { ExternalLink } from '../project/ExternalLink'
import { DatasetDiagnostic, EngineDataset } from '../engine/model'
import { EnrichmentBootstrap } from '../enrichmentdb/model'

@Entity()
export class Dataset {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'uuid' })
  userId: string; // dataset submitter and owner -> edit rights

  @ManyToOne(() => User, user => user.datasets)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid', nullable: true })
  groupId: string | null; // dataset belongs to group -> all members have view rights

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ default: false })
  groupApproved: boolean; // true when submitter is a group member

  // when user manually inputs PI details
  @Column({ type: 'text', nullable: true })
  piName: string | null;

  @Column({ type: 'text', nullable: true })
  piEmail: string | null;

  // sm-engine and sm-graphql create & manage the public.dataset (EngineDataset) and graphql.dataset (Dataset) tables
  // independently, so this relationship doesn't enforce an FK.
  @OneToOne(() => EngineDataset, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'id' })
  engineDataset: EngineDataset;

  @OneToMany(() => DatasetProject, datasetProject => datasetProject.dataset)
  datasetProjects: DatasetProject[];

  @Column({ type: 'json', nullable: true })
  externalLinks: ExternalLink[] | null;

  @OneToMany(() => DatasetDiagnostic, datasetDiagnostic => datasetDiagnostic.dataset)
  datasetDiagnostics: DatasetDiagnostic[];

  @OneToMany(() => EnrichmentBootstrap, enrichmentBootstrap => enrichmentBootstrap.dataset)
  enrichmentBootstrap: EnrichmentBootstrap[];
}

@Entity({ name: 'dataset_project' })
export class DatasetProject {
  @PrimaryColumn({ type: 'text' })
  datasetId: string;

  @ManyToOne(() => Dataset)
  @JoinColumn({ name: 'dataset_id' })
  dataset: Dataset;

  @PrimaryColumn({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ type: 'boolean' })
  approved: boolean;
}

export const DATASET_ENTITIES = [
  Dataset,
  DatasetProject,
]
