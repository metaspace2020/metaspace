import {
  Entity,
  PrimaryColumn,
  Column, ManyToOne, JoinColumn, OneToMany, Index, PrimaryGeneratedColumn,
} from 'typeorm'
import { MomentValueTransformer } from '../../utils/MomentValueTransformer'
import { Moment } from 'moment'
import { MolecularDB } from '../moldb/model'

@Entity('coloc_job')
export class ColocJob {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text', name: 'ds_id' })
  datasetId: string;

  @Column({ type: 'int' })
  moldbId: number;

  @Column({ type: 'numeric', precision: 2, scale: 2 })
  fdr: number;

  @Column({ type: 'text' })
  algorithm: string;

  @Column({ type: 'timestamp without time zone', transformer: new MomentValueTransformer() })
  start: Moment;

  @Column({ type: 'timestamp without time zone', transformer: new MomentValueTransformer() })
  finish: Moment;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', array: true })
  sampleIonIds: number[];

  @OneToMany(() => ColocAnnotation, colocAnnotation => colocAnnotation.colocJob)
  colocAnnotations: ColocAnnotation[];

  @ManyToOne(() => MolecularDB, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moldb_id' })
  molecularDB: MolecularDB;
}

@Entity('coloc_annotation')
export class ColocAnnotation {
  @PrimaryColumn({ type: 'uuid' })
  colocJobId: string;

  /** Index of the annotation's sfAdduct in the parent ColocJob's orderedMols array */
  @PrimaryColumn({ type: 'int' })
  ionId: number;

  @Column({ type: 'int', array: true })
  colocIonIds: number[];

  @Column({ type: 'float4', array: true })
  colocCoeffs: number[];

  @ManyToOne(() => ColocJob, { onDelete: 'CASCADE' })
  @JoinColumn()
  colocJob: ColocJob;
}

@Entity('ion')
@Index(['formula', 'chemMod', 'neutralLoss', 'adduct', 'charge'], { unique: true })
export class Ion {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  /**
   * All components of the ion in one string, with charge as a '+'/'-' suffix e.g. "C21H41O6P-HO+HO3P-H2O-CO2+Na+".
   * Note that this isn't unique - it's possible for different combinations of chemMods, neutralLosses and adducts
   * to build the same ion.
   */
  @Column({ type: 'text' })
  @Index()
  ion: string;

  /** The formula of the molecule prior to any modifications, e.g. "C21H41O6P".
   *  Internally this has been called "sumFormula" or "sf", but this term is incorrect.
   *  It should be referred to as "formula" or "molecular formula". */
  @Column({ type: 'text' })
  formula: string;

  @Column({ type: 'text', default: '' })
  chemMod: string;

  @Column({ type: 'text', default: '' })
  neutralLoss: string;

  @Column({ type: 'text' })
  adduct: string;

  @Column({ type: 'text', default: '' })
  ionFormula: string;

  /** 1 or -1 */
  @Column({ type: 'smallint' })
  charge: number;
}

export const ANNOTATION_ENTITIES = [
  ColocJob,
  ColocAnnotation,
  Ion,
]
