import { Column, Entity, PrimaryColumn } from 'typeorm'
import { Moment } from 'moment'
import { MomentValueTransformer } from '../../utils/MomentValueTransformer'

@Entity()
export class ImageViewerSnapshot {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @PrimaryColumn({ type: 'text' })
  datasetId: string;

  @Column({ type: 'text' })
  snapshot: string;

  @Column({ type: 'json' })
  annotationIds: string[];

  @Column({ type: 'json', nullable: true })
  ionFormulas: string[];

  @Column({ type: 'json', nullable: true })
  dbIds: string[];

  @Column({ type: 'int' })
  version: number;

  /* for future management UI */

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({
    name: 'created_dt', type: 'timestamp without time zone', transformer: new MomentValueTransformer(),
  })
  createdDT: Moment;
}

export const IMAGE_VIEWER_SNAPSHOT_ENTITIES = [
  ImageViewerSnapshot,
]
