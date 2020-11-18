import { Column, Entity, PrimaryColumn } from 'typeorm';
import { Moment } from 'moment';
import { MomentValueTransformer } from '../../utils/MomentValueTransformer';

@Entity()
export class ImageViewerLink {

  @PrimaryColumn({ type: 'text' })
  id: string;

  @PrimaryColumn({ type: 'text' })
  datasetId: string;

  @Column({ type: 'text' })
  snapshot: string;

  @Column({ type: 'json' })
  annotationIds: string[];

  @Column({ type: 'int' })
  version: number;

  /* for future management UI */

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({
    name: 'created_dt', type: 'timestamp without time zone', transformer: new MomentValueTransformer()
  })
  createdDT: Moment;
}

export const IMAGE_VIEWER_LINK_ENTITIES = [
  ImageViewerLink
]
