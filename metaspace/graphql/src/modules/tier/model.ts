import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { MomentValueTransformer } from '../../utils/MomentValueTransformer'
import { Moment } from 'moment'
import { User } from '../user/model'
import { Dataset } from '../dataset/model'

@Entity({ schema: 'public' })
export class Tier {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text' })
    name: string;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @Column({
      name: 'created_at', type: 'timestamp without time zone', transformer: new MomentValueTransformer(),
    })
    createdAt: Moment;
}

@Entity({ schema: 'public' })
export class TierRule {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'tier_id' })
    tierId: number;

    @Column({ name: 'action_type', type: 'text' })
    actionType: string;

    @Column({ type: 'int' })
    period: number;

    @Column({ name: 'period_type', type: 'text' })
    periodType: string;

    @Column({ type: 'int' })
    limit: number;

    @Column({
      name: 'created_at', type: 'timestamp without time zone', transformer: new MomentValueTransformer(),
    })
    createdAt: Moment;

    @ManyToOne(() => Tier)
    @JoinColumn({ name: 'tier_id' })
    tier: Tier;
}

@Entity({ schema: 'public' })
export class ApiUsage {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'uuid' })
    userId: string;

    @Column({ type: 'text', name: 'dataset_id' })
    datasetId: string;

    @Column({ type: 'text' })
    actionType: string;

    @Column({ type: 'text' })
    datasetType: string;

    @Column({ type: 'text' })
    source: string;

    @Column({
      name: 'action_dt', type: 'timestamp without time zone', transformer: new MomentValueTransformer(),
    })
    actionDt: Moment;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ManyToOne(() => Dataset)
    @JoinColumn({ name: 'dataset_id' })
    dataset: Dataset;
}

export const TIER_ENTITIES = [
  Tier,
  TierRule, ApiUsage,
]
