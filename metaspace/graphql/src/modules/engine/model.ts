import {Column, Entity, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {MomentValueTransformer} from '../../utils/MomentValueTransformer';

export type DatasetStatus = 'QUEUED' | 'ANNOTATING' | 'FINISHED' | 'FAILED';

@Entity({schema: 'public', name: 'dataset', synchronize: false})
export class EngineDataset {
  @PrimaryColumn({ type: 'text' })
  id: string;
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
  @Column({ type: 'float', array: true, nullable: true })
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

  opticalImages: EngineOpticalImage[]
}

@Entity({schema: 'public', name: 'optical_image', synchronize: false})
export class EngineOpticalImage {
  @PrimaryColumn({ type: 'text' })
  id: string;
  @ManyToOne(type => EngineDataset, dataset => dataset.opticalImages)
  @JoinColumn({ name: 'ds_id' })
  datasetId: string;
  @Column({ type: 'text' })
  type: string;
  @Column({ type: 'real' })
  zoom: number;
  @Column({ type: 'int' })
  width: number;
  @Column({ type: 'int' })
  height: number;
  @Column({ type: 'real', array: true })
  transform: number[][];
}


export const ENGINE_ENTITIES = [
  EngineDataset,
  EngineOpticalImage,
];
