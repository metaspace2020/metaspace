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
import { Dataset } from '../dataset/model'
import { Moment } from 'moment'
import { EnrichmentBootstrap } from '../enrichmentdb/model'

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
  roi: any;
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
  @Column({ type: 'json', nullable: true })
  sizeHash: any;

  // sm-engine and sm-graphql create & manage the public.dataset (EngineDataset) and graphql.dataset (Dataset) tables
  // independently, so this relationship doesn't enforce an FK.
  @ManyToOne(() => Dataset, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'id' })
  dataset: Dataset;

  @OneToMany(() => OpticalImage, opticalImage => opticalImage.dataset)
  opticalImages: OpticalImage[];

  @OneToMany(() => Job, job => job.dataset)
  jobs: Job[];

  @OneToMany(() => PerfProfile, pipelineStats => pipelineStats.dataset)
  pipelineStats: PerfProfile[];

  @OneToMany(() => DatasetDiagnostic, datasetDiagnostic => datasetDiagnostic.engineDataset)
  datasetDiagnostics: DatasetDiagnostic[];

  @OneToMany(() => EnrichmentBootstrap, enrichmentBootstrap => enrichmentBootstrap.engineDataset)
  enrichmentBootstrap: EnrichmentBootstrap[];
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

  @OneToMany(() => DatasetDiagnostic, datasetDiagnostic => datasetDiagnostic.job)
  datasetDiagnostics: DatasetDiagnostic[];
}

// Should match the literal in metaspace/engine/sm/engine/annotation/diagnostics.py
export type DiagnosticType = 'TIC' | 'IMZML_METADATA' | 'FDR_RESULTS'
export const DiagnosticTypeOptions: {[k in DiagnosticType]: k} = {
  TIC: 'TIC',
  IMZML_METADATA: 'IMZML_METADATA',
  FDR_RESULTS: 'FDR_RESULTS',
}

export type DiagnosticImageFormat = 'PNG' | 'NPY' | 'JSON' | 'PARQUET'
export interface DiagnosticImage {
  key: string;
  index?: number;
  image_id: string;
  url: string;
  format: DiagnosticImageFormat;
}

@Entity({ schema: 'public' })
// This is the main index for lookup performance. It enforces uniqueness when jobId is non-null, however because
// NULL != NULL in postgres, this index doesn't enforce uniqueness of (datasetId, type) when jobId is NULL.
// (i.e. counterintuitively, this index won't prevent inserting ('2001-01-01_00h00m00s', 'TIC', NULL) even if an
// identical row already exists, because NULL != NULL, so NULL is always considered a unique value)
// Therefore a second index is used for enforcing uniqueness when jobId is null.
@Index(['datasetId', 'type', 'jobId'], { unique: true })
@Index(['datasetId', 'type'], { unique: true, where: 'job_id IS NULL' })
export class DatasetDiagnostic {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text', enum: Object.values(DiagnosticTypeOptions) })
  type: DiagnosticType;

  @Column({ name: 'ds_id', type: 'text' })
  datasetId: string;

  @Column({ type: 'int', nullable: true })
  jobId: number | null;

  @Column({
    type: 'timestamp without time zone',
    default: () => "(now() at time zone 'utc')",
    transformer: new MomentValueTransformer(),
  })
  updatedDT: Moment;

  @Column({ type: 'json', nullable: true })
  data: any;

  @Column({ type: 'text', nullable: true })
  error: any;

  // images are stored separately in an array with a defined structure so that it's easy for all images to be cleaned
  // up when a dataset is deleted, without needing to understand any of the structure in `data`.
  // All created Image IDs MUST be included in this column. Additionally, they MAY be referenced in `data`
  // (preferably by `key` instead of `image_id`).
  @Column({ type: 'json' })
  images: DiagnosticImage[];

  // This table is a child table of public.dataset, not graphql.dataset, so avoid making an FK
  @ManyToOne(() => Dataset, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'ds_id' })
  dataset: Dataset;

  @ManyToOne(() => EngineDataset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ds_id' })
  engineDataset: EngineDataset;

  @ManyToOne(() => Job, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;
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

@Entity({ schema: 'public' })
export class ScoringModel {
  @PrimaryGeneratedColumn()
  id: number;

  /** `name` is for finding models based on a dataset's `scoring_model` DSConfig value */
  @Index({ unique: true })
  @Column({ type: 'text' })
  name: string;

  /** `type` is hint for how to interpret `params`. sm-engine is responsible for managing the valid values. */
  @Column({ type: 'text' })
  type: string;

  /** `params` is a JSON blob of anything sm-engine needs to load & use the model. It's intentionally schemaless,
   as it's very likely that future model types will need to extend the structure. */
  @Column({ type: 'json' })
  params: any;
}

export const ENGINE_ENTITIES = [
  EngineDataset,
  OpticalImage,
  Job,
  DatasetDiagnostic,
  Annotation,
  PerfProfile,
  PerfProfileEntry,
  ScoringModel,
]
