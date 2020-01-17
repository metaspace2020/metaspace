import {Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, Unique} from 'typeorm';
import {Group} from '../group/model';
import {User} from '../user/model';
import {Project} from '../project/model';
import {PublicationStatus} from '../../binding';
import {PublicationStatusOptions as PSO} from '../project/PublicationStatusOptions';
import {ELPO, ExternalLinkProvider, ExternalLinkProviderOptions} from '../project/ExternalLinkProvider';

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

  @OneToMany(type => DatasetExternalLink, extLink => extLink.dataset)
  externalLinks: DatasetExternalLink[];
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

  @Column({ type: 'text', enum: Object.keys(PSO), default: PSO.UNPUBLISHED })
  publicationStatus: PublicationStatus;
}

@Entity({ name: 'dataset_ext_link' })
@Unique(['datasetId', 'provider', 'link'])
export class DatasetExternalLink {

  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text' })
  datasetId: string;

  @ManyToOne(type => Dataset, {onDelete: 'CASCADE'})
  @JoinColumn({ name: 'dataset_id' })
  dataset: Dataset;

  @Column({ type: 'text', enum: Object.keys(ELPO) })
  provider: ExternalLinkProvider;

  @Column({ type: 'text' })
  link: string;
}

export const DATASET_ENTITIES = [
  Dataset,
  DatasetProject,
  DatasetExternalLink,
];
