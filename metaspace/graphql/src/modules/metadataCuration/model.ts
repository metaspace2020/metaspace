import { Column, Entity, EntityManager, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm'
import { User } from '../user/model'
import { Dataset } from '../dataset/model'

export type CurationTermStatus = 'pending' | 'approved' | 'mapped' | 'rejected'
export type CurationApplyState = 'idle' | 'running' | 'done' | 'failed'

// The gin indexes (normalized_text gin_trgm_ops, aliases) cannot be expressed
// with TypeORM 0.2 decorators, so they live in the migration only.
@Unique('UQ_metadata_curation_term_slot_dataset', ['slot', 'datasetId'])
@Index('metadata_curation_term_slot_status_index', ['slot', 'status'])
@Index('metadata_curation_term_slot_normalized_text_index', ['slot', 'normalizedText'])
@Entity({ schema: 'public', name: 'metadata_curation_term' })
export class MetadataCurationTerm {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v4()' })
  id: string

  @Column({ type: 'text' })
  slot: string

  @Column({ type: 'text' })
  normalizedText: string

  @Column({ type: 'text' })
  text: string

  @Column({ type: 'text', default: 'pending' })
  status: CurationTermStatus

  @Column({ type: 'text', nullable: true })
  canonicalLabel: string | null

  @Column({ type: 'text', nullable: true })
  ontologyId: string | null

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  aliases: string[]

  @Column({ type: 'text', nullable: true })
  suggestedOntologyId: string | null

  @Column({ type: 'text', nullable: true })
  suggestedLabel: string | null

  @Column({ type: 'real', nullable: true })
  suggestedScore: number | null

  @Column({ type: 'text', nullable: true })
  note: string | null

  @Index('metadata_curation_term_dataset_id_index')
  @Column({ type: 'text' })
  datasetId: string

  @ManyToOne(() => Dataset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dataset_id' })
  dataset?: Dataset

  @Column({ type: 'uuid', nullable: true })
  submitterId: string | null

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submitter_id' })
  submitter?: User

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date

  @Column({ type: 'uuid', nullable: true })
  decidedById: string | null

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'decided_by_id' })
  decidedBy?: User

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null

  @Column({ type: 'text', default: 'idle' })
  applyState: CurationApplyState

  @Column({ type: 'integer', default: 0 })
  appliedCount: number
}

export const METADATA_CURATION_ENTITIES = [MetadataCurationTerm]

export const deletePendingRows = async(em: EntityManager, datasetId: string, slots: string[]): Promise<void> => {
  await em.query(
    'DELETE FROM public.metadata_curation_term WHERE dataset_id = $1 AND slot = ANY($2) AND status = \'pending\'',
    [datasetId, slots]
  )
}
