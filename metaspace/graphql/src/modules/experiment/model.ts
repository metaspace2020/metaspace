import {
  Entity, PrimaryColumn, PrimaryGeneratedColumn, Column,
  ManyToOne, OneToMany, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm'
import { Project } from '../project/model'
import { User } from '../user/model'
import { EngineDataset } from '../engine/model'
import { Ion } from '../annotation/model'

export type ExperimentMatchMode = 'name' | 'manual'
export type ExperimentRunStatus =
  | 'QUEUED' | 'PREPARING' | 'RUNNING' | 'FINISHED' | 'FAILED'
export type ExperimentRunStage = 'PREP' | 'TEST' | 'DONE'

export interface ExperimentLabelGroupSpec {
  name: string
  color: string
}

export interface ExperimentRegionSpec {
  regionKey: string
  sourceKind: 'roi' | 'segmentation_cluster' | 'whole'
  roiId: number | null
  segmentationId: string | null
  labelGroupName: string | null
  metadata: {
    condition: string
    biologicalReplicateId: string
    sampleId: string
    technicalReplicateId: string | null
    batchId: string | null
  }
}

@Entity({ schema: 'public', name: 'experiment' })
export class Experiment {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project

  @Column({ name: 'created_by', type: 'uuid' })
  createdById: string

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User

  @Column({ type: 'text' })
  name: string

  @Column({ type: 'text', nullable: true })
  description: string | null

  @Column({ name: 'match_mode', type: 'text' })
  matchMode: ExperimentMatchMode

  @Column({ name: 'label_groups', type: 'jsonb', default: () => "'[]'::jsonb" })
  labelGroups: ExperimentLabelGroupSpec[]

  @Column({ name: 'run_status', type: 'text', nullable: true })
  runStatus: ExperimentRunStatus | null

  @Column({ name: 'run_stage', type: 'text', nullable: true })
  runStage: ExperimentRunStage | null

  @Column({ name: 'run_filters', type: 'jsonb', nullable: true })
  runFilters: Record<string, unknown> | null

  @Column({ name: 'run_excluded_samples', type: 'jsonb', default: () => "'[]'::jsonb" })
  runExcludedSamples: string[]

  @Column({ name: 'run_inferred_test', type: 'text', nullable: true })
  runInferredTest: string | null

  @Column({ name: 'run_error', type: 'text', nullable: true })
  runError: string | null

  @Column({ name: 'run_started_at', type: 'timestamp', nullable: true })
  runStartedAt: Date | null

  @Column({ name: 'run_finished_at', type: 'timestamp', nullable: true })
  runFinishedAt: Date | null

  @Column({ name: 'run_generation', type: 'integer', default: 0 })
  runGeneration: number

  @Column({ name: 'run_qc', type: 'jsonb', nullable: true })
  runQc: Record<string, unknown> | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @OneToMany(() => ExperimentDataset, ed => ed.experiment)
  datasets: ExperimentDataset[]
}

@Entity({ schema: 'public', name: 'experiment_dataset' })
export class ExperimentDataset {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  @Column({ name: 'experiment_id', type: 'uuid' })
  experimentId: string

  @ManyToOne(() => Experiment, e => e.datasets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'experiment_id' })
  experiment: Experiment

  @Column({ name: 'dataset_id', type: 'text' })
  datasetId: string

  @ManyToOne(() => EngineDataset)
  @JoinColumn({ name: 'dataset_id' })
  dataset: EngineDataset

  @Column({ name: 'region_source', type: 'text' })
  regionSource: 'roi' | 'segmentation' | 'whole'

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  regions: ExperimentRegionSpec[]
}

@Entity({ schema: 'public', name: 'experiment_result' })
export class ExperimentResult {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  @Column({ name: 'experiment_id', type: 'uuid' })
  experimentId: string

  @ManyToOne(() => Experiment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'experiment_id' })
  experiment: Experiment

  @Column({ name: 'run_generation', type: 'integer' })
  runGeneration: number

  @Column({ name: 'ion_id', type: 'integer' })
  ionId: number

  @ManyToOne(() => Ion)
  @JoinColumn({ name: 'ion_id' })
  ion: Ion

  @Column({ name: 'label_group_name', type: 'text' })
  labelGroupName: string

  @Column({ type: 'real' })
  lfc: number

  @Column({ name: 'p_value', type: 'real', nullable: true })
  pValue: number | null

  @Column({ type: 'real', nullable: true })
  fdr: number | null

  @Column({ name: 'detection_rate_a', type: 'real' })
  detectionRateA: number

  @Column({ name: 'detection_rate_b', type: 'real' })
  detectionRateB: number

  @Column({ name: 'n_a', type: 'integer' })
  nA: number

  @Column({ name: 'n_b', type: 'integer' })
  nB: number
}

export const EXPERIMENT_ENTITIES = [
  Experiment,
  ExperimentDataset,
  ExperimentResult,
]
