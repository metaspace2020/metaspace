import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm'
import { Moment } from 'moment'
import { MomentValueTransformer } from '../../utils/MomentValueTransformer'
import { User } from '../user/model'

export type NewsType = 'news' | 'message' | 'system_notification'
export type NewsVisibility = 'public' | 'logged_users' | 'specific_users' | 'pro_users'
 | 'non_pro_users' | 'visibility_except'
export type NewsEventType = 'viewed' | 'clicked' | 'link_clicked'

@Entity({ schema: 'public' })
export class News {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', default: 'news' })
  type: NewsType;

  @Column({ type: 'text', default: 'logged_users' })
  visibility: NewsVisibility;

  @Column({ name: 'show_on_home_page', type: 'boolean', default: false })
  showOnHomePage: boolean;

  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible: boolean;

  @Column({
    name: 'show_from',
    type: 'timestamp without time zone',
    nullable: true,
    transformer: new MomentValueTransformer(),
  })
  showFrom: Moment | null;

  @Column({
    name: 'show_until',
    type: 'timestamp without time zone',
    nullable: true,
    transformer: new MomentValueTransformer(),
  })
  showUntil: Moment | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({
    name: 'created_at',
    type: 'timestamp without time zone',
    transformer: new MomentValueTransformer(),
  })
  createdAt: Moment;

  @Column({
    name: 'updated_at',
    type: 'timestamp without time zone',
    transformer: new MomentValueTransformer(),
  })
  updatedAt: Moment;

  @Column({
    name: 'deleted_at',
    type: 'timestamp without time zone',
    nullable: true,
    transformer: new MomentValueTransformer(),
  })
  deletedAt: Moment | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User;
}

@Entity({ schema: 'public' })
export class NewsEvent {
  @PrimaryColumn({ type: 'int', generated: true })
  id: number;

  @Column({ name: 'news_id', type: 'uuid' })
  newsId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'hashed_ip', type: 'text', nullable: true })
  hashedIp: string | null;

  @Column({ name: 'event_type', type: 'text' })
  eventType: NewsEventType;

  @Column({ name: 'link_url', type: 'text', nullable: true })
  linkUrl: string | null;

  @Column({
    name: 'created_at',
    type: 'timestamp without time zone',
    transformer: new MomentValueTransformer(),
  })
  createdAt: Moment;

  @ManyToOne(() => News)
  @JoinColumn({ name: 'news_id' })
  news?: News;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}

@Entity({ schema: 'public' })
export class NewsTargetUser {
  @PrimaryColumn({ type: 'int', generated: true })
  id: number;

  @Column({ name: 'news_id', type: 'uuid' })
  newsId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    name: 'created_at',
    type: 'timestamp without time zone',
    transformer: new MomentValueTransformer(),
  })
  createdAt: Moment;

  @ManyToOne(() => News)
  @JoinColumn({ name: 'news_id' })
  news?: News;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: User;
}

@Entity({ schema: 'public' })
export class NewsBlacklistUser {
  @PrimaryColumn({ type: 'int', generated: true })
  id: number;

  @Column({ name: 'news_id', type: 'uuid' })
  newsId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    name: 'created_at',
    type: 'timestamp without time zone',
    transformer: new MomentValueTransformer(),
  })
  createdAt: Moment;

  @ManyToOne(() => News)
  @JoinColumn({ name: 'news_id' })
  news?: News;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: User;
}

export const NEWS_ENTITIES = [
  News,
  NewsEvent,
  NewsTargetUser,
  NewsBlacklistUser,
]
