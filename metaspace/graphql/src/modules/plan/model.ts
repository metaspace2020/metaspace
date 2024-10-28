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

    @Column({ type: 'text', enum: ['DOWNLOAD', 'CREATE', 'UPDATE', 'PROCESS', 'DELETE'] })
    actionType: 'DOWNLOAD' | 'CREATE' | 'UPDATE' | 'PROCESS' | 'DELETE';

    @Column({ type: 'int' })
    period: number;

    @Column({ name: 'period_type', type: 'text', enum: ['SECOND', 'MINUTE', 'HOUR', 'DAY', 'MONTH', 'YEAR'] })
    periodType: 'SECOND' | 'MINUTE' | 'HOUR' | 'DAY' | 'MONTH' | 'YEAR';

    @Column({ type: 'int' })
    limit: number;

    @Column({ type: 'text', enum: ['DATASET', 'GROUP', 'PROJECT', 'USER'] })
    type: 'DATASET' | 'GROUP' | 'PROJECT' | 'USER';

    @Column({ name: 'visibility', type: 'text', enum: ['PUBLIC', 'PRIVATE'] })
    visibility: 'PUBLIC' | 'PRIVATE';

    @Column({ name: 'source', type: 'text', enum: ['WEB', 'API'] })
    source: 'WEB' | 'API';

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

    @Column({ type: 'text', enum: ['DATASET', 'GROUP', 'PROJECT', 'USER'] })
    type: 'DATASET' | 'GROUP' | 'PROJECT' | 'USER';

    @Column({ type: 'text', enum: ['DOWNLOAD', 'CREATE', 'UPDATE', 'PROCESS', 'DELETE'] })
    actionType: 'DOWNLOAD' | 'CREATE' | 'UPDATE' | 'PROCESS' | 'DELETE';

    @Column({ name: 'visibility', type: 'text', enum: ['PUBLIC', 'PRIVATE'] })
    visibility: 'PUBLIC' | 'PRIVATE';

    @Column({ name: 'source', type: 'text', enum: ['WEB', 'API'] })
    source: 'WEB' | 'API';

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
