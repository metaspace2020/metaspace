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
} from 'typeorm';
import {MomentValueTransformer} from '../../utils/MomentValueTransformer';
import {Ion} from '../annotation/model';

export type DatasetStatus = 'QUEUED' | 'ANNOTATING' | 'FINISHED' | 'FAILED';

@Entity({schema: 'public', name: 'dataset'})
export class EngineDataset {
  @PrimaryColumn({ type: 'text' })
  id: string;
  @Index('ind_dataset_name')
  @Column({ type: 'text', nullable: true })
  name: string | null;
  @Column({ type: 'text', nullable: true })
  inputPath: string | null;
  @Column({ type: 'json', nullable: true })
  metadata: object | null;
  @Column({ type: 'json', nullable: true })
  config: object | null;
  @Column({ type: 'timestamp without time zone', nullable: true, transformer: new MomentValueTransformer() })
  uploadDt: Date | null;
  @Column({ type: 'text', nullable: true })
  status: DatasetStatus | null;
  @Column({ type: 'text', nullable: true })
  opticalImage: string | null;
  @Column({ type: 'double precision', array: true, nullable: true })
  transform: number[] | null;
  @Column({ type: 'boolean', default: true })
  is_public: boolean;
  @Column({ type: 'json', nullable: true })
  acq_geometry: object | null;
  @Column({ type: 'text', default: 'fs' })
  ion_img_storage_type: string;
  @Column({ type: 'text', nullable: true })
  thumbnail: string | null;
  @Column({ type: 'text', nullable: true })
  ion_thumbnail: string | null;

  @OneToMany(type => OpticalImage, opticalImage => opticalImage.dataset)
  opticalImages: OpticalImage[];

  @OneToMany(type => Job, job => job.dataset)
  jobs: Job[];
}

@Entity({schema: 'public'})
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

  @ManyToOne(type => EngineDataset, dataset => dataset.opticalImages, {onDelete: 'CASCADE'})
  @JoinColumn({ name: 'ds_id' })
  dataset: EngineDataset;
}

@Entity({schema: 'public'})
export class Job {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'int', nullable: true })
  dbId: number | null;
  @Column({ name: 'ds_id', nullable: true })
  datasetId: string | null;
  @Column({ type: 'text', nullable: true })
  status: DatasetStatus | null;
  @Column({ type: 'timestamp', nullable: true })
  start: number;
  @Column({ type: 'timestamp', nullable: true })
  finish: number;

  @ManyToOne(type => EngineDataset, dataset => dataset.jobs, {onDelete: 'CASCADE'})
  @JoinColumn({ name: 'ds_id' })
  dataset: EngineDataset;

  @OneToMany(type => Annotation, annotation => annotation.job)
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

@Entity({schema: 'public'})
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

  @ManyToOne(type => Job, job => job.annotations, {onDelete: 'CASCADE'})
  @JoinColumn({name: 'job_id'})
  job: Job;

  @ManyToOne(type => Ion,  {onDelete: 'SET NULL'})
  @JoinColumn({name: 'ion_id'})
  ion: Ion | null;
}

export const ENGINE_ENTITIES = [
  EngineDataset,
  OpticalImage,
  Job,
  Annotation,
];
