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
