import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm'
import { MomentValueTransformer } from '../../utils/MomentValueTransformer'
import { Ion } from '../annotation/model'
import { MolecularDB } from '../moldb/model'

export type DatasetStatus = 'QUEUED' | 'ANNOTATING' | 'FINISHED' | 'FAILED';

@Entity({ schema: 'public', name: 'dataset' })
export class EngineDataset {
  @PrimaryColumn({ type: 'text' })
  id: string;
  @Index('ind_dataset_name')
  @Column({ type: 'text', nullable: true })
  name: string | null;
  @Column({ type: 'text', nullable: true })
  inputPath: string | null;
  @Column({ type: 'json', nullable: true })
  metadata: any;
  @Column({ type: 'json', nullable: true })
  config: any;
  @Column({ type: 'timestamp without time zone', nullable: true, transformer: new MomentValueTransformer() })
  uploadDt: Date | null;
  @Column({ type: 'text', nullable: true })
  status: DatasetStatus | null;
  @Column({ type: 'timestamp without time zone', transformer: new MomentValueTransformer() })
  statusUpdateDt: Date | null;
  @Column({ type: 'text', nullable: true })
  opticalImage: string | null;
  @Column({ type: 'double precision', array: true, nullable: true })
  transform: number[] | null;
  @Column({ type: 'boolean', default: true })
  isPublic: boolean;
  @Column({ type: 'json', nullable: true })
  acqGeometry: any;
  @Column({ type: 'text', default: 'fs' })
  ionImgStorageType: string;
  @Column({ type: 'text', nullable: true })
  thumbnail: string | null;
  @Column({ type: 'text', nullable: true })
  thumbnailUrl: string | null;
  @Column({ type: 'text', nullable: true })
  ionThumbnail: string | null;
  @Column({ type: 'text', nullable: true })
  ionThumbnailUrl: string | null;

  @OneToMany(() => OpticalImage, opticalImage => opticalImage.dataset)
  opticalImages: OpticalImage[];

  @OneToMany(() => Job, job => job.dataset)
  jobs: Job[];

  @OneToMany(() => PerfProfile, pipelineStats => pipelineStats.dataset)
  pipelineStats: PerfProfile[];
}

@Entity({ schema: 'public' })
export class OpticalImage {
  @PrimaryColumn({ type: 'text' })
  id: string;
  @Column({ name: 'ds_id' })
  datasetId: string;
  @Column({ type: 'text' })
  type: string;
  @Column({ type: 'real' })
  zoom: number;
  @Column({ type: 'int' })
  width: number;
  @Column({ type: 'int' })
  height: number;
  @Column({ type: 'real', array: true, nullable: true })
  transform: number[][];
  @Column({ type: 'text', nullable: true })
  url: string;

  @ManyToOne(() => EngineDataset, dataset => dataset.opticalImages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ds_id' })
  dataset: EngineDataset;
}

@Entity({ schema: 'public' })
export class Job {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: 'moldb_id', type: 'int' })
  moldbId: number;
  @Column({ name: 'ds_id', nullable: true })
  datasetId: string | null;
  @Column({ type: 'text', nullable: true })
  status: DatasetStatus | null;
  @Column({ type: 'timestamp', nullable: true })
  start: Date | null;
  @Column({ type: 'timestamp', nullable: true })
  finish: Date | null;

  @ManyToOne(() => EngineDataset, dataset => dataset.jobs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ds_id' })
  dataset: EngineDataset;

  @ManyToOne(() => MolecularDB, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moldb_id' })
  molecularDB: MolecularDB;

  @OneToMany(() => Annotation, annotation => annotation.job)
  annotations: Annotation[];
}

interface AnnotationStats {
  chaos: number;
  spatial: number;
  spectral: number;
  msm: number;
  total_iso_ints: number[];
  min_iso_ints: number[];
  max_iso_ints: number[];
}

type OffSampleLabel = 'off' | 'on';
interface AnnotationOffSample {
  prob: number;
  label: OffSampleLabel;
}

@Entity({ schema: 'public' })
@Unique('annotation_annotation_uindex', ['jobId', 'formula', 'chemMod', 'neutralLoss', 'adduct'])
export class Annotation {
  @PrimaryGeneratedColumn()
  id: number;
  @Index('annotation_job_id_index')
  @Column()
  jobId: number;
  @Column({ type: 'text' })
  formula: string;
  @Column({ type: 'text' })
  chemMod: string;
  @Column({ type: 'text' })
  neutralLoss: string;
  @Column({ type: 'text' })
  adduct: string;
  @Column({ type: 'real' })
  msm: number;
  @Column({ type: 'real' })
  fdr: number;
  @Column({ type: 'json' })
  stats: AnnotationStats;
  @Column({ type: 'text', array: true })
  isoImageIds: string[];
  @Column({ type: 'json', nullable: true })
  offSample: AnnotationOffSample | null;
  @Column({ type: 'int', nullable: true })
  ionId: number | null;

  @ManyToOne(() => Job, job => job.annotations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @ManyToOne(() => Ion, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ion_id' })
  ion: Ion | null;
}

@Entity({ schema: 'public' })
export class PerfProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  taskType: string;

  @Column({ name: 'ds_id', nullable: true })
  datasetId: string | null;

  @Column({ type: 'timestamp' })
  start: Date;

  @Column({ type: 'timestamp', nullable: true })
  finish: Date | null;

  @Column({ type: 'json', nullable: true })
  extraData: any;

  @Column({ type: 'text', nullable: true })
  logs: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @ManyToOne(() => EngineDataset, dataset => dataset.pipelineStats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ds_id' })
  dataset: EngineDataset;

  @OneToMany(() => PerfProfileEntry, entry => entry.profile)
  entries: PerfProfileEntry[];
}

@Entity({ schema: 'public' })
export class PerfProfileEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  profileId: number;

  @Column({ type: 'int' })
  sequence: number;

  @Column({ type: 'timestamp' })
  start: Date;

  @Column({ type: 'timestamp' })
  finish: Date;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'json', nullable: true })
  extraData: any;

  @ManyToOne(() => PerfProfile, profile => profile.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: PerfProfile;
}

export const ENGINE_ENTITIES = [
  EngineDataset,
  OpticalImage,
  Job,
  Annotation,
  PerfProfile,
  PerfProfileEntry,
]
