import {Column, Entity, JoinColumn, JoinTable, ManyToOne, OneToMany, PrimaryColumn} from 'typeorm';
import {Group} from '../group/model';
import {User} from '../user/model';
import {Project} from '../project/model';

@Entity()
export class Dataset {

  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string; // dataset submitter and owner -> edit rights

  @ManyToOne(type => User, user => user.datasets)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'group_id', nullable: true })
  groupId: string | null; // dataset belongs to group -> all members have view rights

  @ManyToOne(type => Group)
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ default: false, name: 'group_approved' })
  groupApproved: boolean; // true when submitter is a group member

  // when user manually inputs PI details
  @Column({ type: 'text', name: 'pi_name', nullable: true })
  piName: string | null;

  @Column({ type: 'text', name: 'pi_email', nullable: true })
  piEmail: string | null;

  @OneToMany(type => DatasetProject, datasetProject => datasetProject.dataset)
  @JoinTable({ name: 'dataset_project' })
  datasetProjects: DatasetProject[];
}

@Entity({ name: 'dataset_project' })
export class DatasetProject {

  @PrimaryColumn({ type: 'text', name: 'dataset_id' })
  datasetId: string;

  @ManyToOne(type => Dataset)
  @JoinColumn({ name: 'dataset_id' })
  dataset: Dataset;

  @PrimaryColumn({ type: 'uuid', name: 'project_id' })
  projectId: string;

  @ManyToOne(type => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ type: 'boolean' })
  approved: Boolean;
}

export type DatasetStatus = 'QUEUED' | 'ANNOTATING' | 'FINISHED' | 'FAILED';
// This isn't an Entity because datasets in the "public" schema are owned by sm-engine and aren't managed by TypeORM
export interface EngineDataset {
  id: string;
  name: string | null;
  input_path: string | null;
  metadata: object | null;
  config: object | null;
  upload_dt: Date | null;
  status: DatasetStatus | null;
  optical_image: string | null;
  transform: number[] | null;
  is_public: boolean;
  acq_geometry: object | null;
  ion_img_storage_type: string;
  thumbnail: string | null;
  ion_thumbnail: string | null;
  mol_dbs: string[];
  adducts: string[];
}

export interface EngineOpticalImage {
  id: string;
  ds_id: string;
  type: string;
  zoom: number;
  scale: number;
  width: number;
  height: number;
  transform: number[][];
}
