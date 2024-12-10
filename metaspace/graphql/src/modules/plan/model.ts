import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne, OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { MomentValueTransformer } from '../../utils/MomentValueTransformer'
import { Moment } from 'moment'
import { User } from '../user/model'
import { Dataset } from '../dataset/model'

@Entity({ schema: 'public' })
export class Plan {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text' })
    name: string;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @Column({ type: 'boolean', default: false })
    isDefault: boolean;

    @Column({
      name: 'created_at', type: 'timestamp without time zone', transformer: new MomentValueTransformer(),
    })
    createdAt: Moment;

    @OneToMany(() => PlanRule, rule => rule.plan)
    planRules: PlanRule[];
}

@Entity({ schema: 'public' })
export class PlanRule {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'plan_id' })
    planId: number;

    @Column({
      type: 'text',
      enum: ['download', 'create', 'update', 'process', 'delete',
        'download_attempt', 'create_attempt', 'login', 'login_attempt'],
    })
    actionType: 'download' | 'create' | 'update' | 'process' | 'delete' | 'download_attempt' |
        'create_attempt' | 'login' | 'login_attempt';

    @Column({ type: 'int' })
    period: number;

    @Column({ name: 'period_type', type: 'text', enum: ['second', 'minute', 'hour', 'day', 'month', 'year'] })
    periodType: 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';

    @Column({ type: 'int' })
    limit: number;

    @Column({ type: 'text', enum: ['dataset', 'group', 'project', 'user'] })
    type: 'dataset' | 'group' | 'project' | 'user';

    @Column({ name: 'visibility', type: 'text', enum: ['public', 'private'] })
    visibility: 'public' | 'private';

    @Column({ name: 'source', type: 'text', enum: ['web', 'api'] })
    source: 'web' | 'api';

    @Column({
      name: 'created_at', type: 'timestamp without time zone', transformer: new MomentValueTransformer(),
    })
    createdAt: Moment;

    @ManyToOne(() => Plan)
    @JoinColumn({ name: 'plan_id' })
    plan: Plan;
}

@Entity({ schema: 'public' })
export class ApiUsage {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'uuid' })
    userId: string;

    @Column({ type: 'text', name: 'dataset_id' })
    datasetId: string;

    @Column({ type: 'text', name: 'project_id' })
    projectId: string;

    @Column({ type: 'text', name: 'group_id' })
    groupId: string;

    @Column({ type: 'text', enum: ['dataset', 'group', 'project', 'user'] })
    type: 'dataset' | 'group' | 'project' | 'user';

    @Column({
      type: 'text',
      enum: ['download', 'create', 'update', 'process', 'delete',
        'download_attempt', 'create_attempt', 'login', 'login_attempt'],
    })
    actionType: 'download' | 'create' | 'update' | 'process' | 'delete' | 'download_attempt' |
        'create_attempt' | 'login' | 'login_attempt';

    @Column({ name: 'visibility', type: 'text', enum: ['public', 'private'] })
    visibility: 'public' | 'private';

    @Column({ name: 'source', type: 'text', enum: ['web', 'api'] })
    source: 'web' | 'api';

    @Column({ type: 'text', name: 'ip_hash' })
    ipHash: string

    @Column({ type: 'text', name: 'device_info' })
    deviceInfo: string

    @Column({ type: 'boolean', default: false })
    canEdit: boolean;

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

export const PLAN_ENTITIES = [
  Plan,
  PlanRule,
  ApiUsage,
]
