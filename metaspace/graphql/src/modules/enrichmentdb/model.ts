import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { MolecularDB } from '../moldb/model'
import { Dataset } from '../dataset/model'
import { EngineDataset } from '../engine/model'
import { MomentValueTransformer } from '../../utils/MomentValueTransformer'

@Entity({ schema: 'public' })
export class EnrichmentDB {
  @PrimaryGeneratedColumn()
  id: number;

  /** `name` is for equivalent enrichment's reference db name */
  @Index({ unique: true })
  @Column({ type: 'text' })
  name: string;
}

@Entity({ schema: 'public' })
export class EnrichmentTerm {
  @PrimaryGeneratedColumn()
  id: number;

  /** `id` is for equivalent enrichment's reference source id */
  @Index({ unique: true })
  @Column({ type: 'text' })
  enrichmentId: string;

  /** `name` is for equivalent enrichment's reference source name */
  @Column({ type: 'text' })
  enrichmentName: string;

  @Column({ type: 'int' })
  enrichmentDbId: number;

  @ManyToOne(() => EnrichmentDB, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrichment_db_id' })
  enrichmentDB: EnrichmentDB;
}

@Entity({ schema: 'public' })
@Index(['molecularDbId', 'formula'])
export class EnrichmentDBMoleculeMapping {
  @PrimaryGeneratedColumn()
  id: number;

  /** molecular db `name` for molecule to map with reference enrichment db */
  @Column({ type: 'text' })
  moleculeEnrichedName: string;

  @Column({ type: 'text' })
  formula: string;

  @Column({ type: 'int' })
  enrichmentTermId: number;

  @Column({ type: 'int' })
  moleculeId: number;

  @Column({ type: 'int' })
  molecularDbId: number;

  @ManyToOne(() => EnrichmentTerm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrichment_term_id' })
  enrichmentTerm: EnrichmentTerm;

  @ManyToOne(() => MolecularDB, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'molecular_db_id' })
  molecularDB: MolecularDB;
}

@Entity({ schema: 'public' })
export class EnrichmentBootstrap {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  scenario: number;

  @Column({ type: 'text' })
  formulaAdduct: string;

  @Column({ name: 'dataset_id' })
  datasetId: string;

  @Column({ name: 'annotation_id' })
  annotationId: string;

  @Column({ type: 'numeric', precision: 2, scale: 2 })
  fdr: string;

  @Column({ type: 'int' })
  enrichmentDbMoleculeMappingId: number;

  // This table is a child table of public.dataset, not graphql.dataset, so avoid making an FK
  @ManyToOne(() => Dataset, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'dataset_id' })
  dataset: Dataset;

  @ManyToOne(() => EngineDataset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dataset_id' })
  engineDataset: EngineDataset;

  @ManyToOne(() => EnrichmentDBMoleculeMapping, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrichment_db_molecule_mapping_id' })
  enrichmentDBMoleculeMapping: EnrichmentDBMoleculeMapping;
}

@Entity({ schema: 'public' })
export class DatasetEnrichment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'dataset_id' })
  datasetId: string;

  @Column({ type: 'int' })
  enrichmentDbId: number;

  @Column({ type: 'timestamp without time zone', nullable: true, transformer: new MomentValueTransformer() })
  processingDt: Date | null;

  @Column({ type: 'int' })
  molecularDbId: number;

  // This table is a child table of public.dataset, not graphql.dataset, so avoid making an FK
  @ManyToOne(() => Dataset, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'dataset_id' })
  dataset: Dataset;

  @ManyToOne(() => MolecularDB, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'molecular_db_id' })
  molecularDB: MolecularDB;

  @ManyToOne(() => EnrichmentDB, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrichment_db_id' })
  enrichmentDB: EnrichmentDB;
}

export const ENRICHMENT_DB_ENTITIES = [
  EnrichmentDB,
  EnrichmentTerm,
  EnrichmentDBMoleculeMapping,
  EnrichmentBootstrap,
  DatasetEnrichment,
]
