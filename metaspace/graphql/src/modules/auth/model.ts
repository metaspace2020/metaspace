import 'reflect-metadata'
import { Column, Entity, PrimaryColumn } from 'typeorm'
import { Moment } from 'moment'
import { MomentValueTransformer } from '../../utils/MomentValueTransformer'

@Entity()
export class Credentials {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text', nullable: true })
  hash: string | null;

  @Column({ type: 'text', nullable: true })
  googleId: string | null;

  @Column({ type: 'text', nullable: true })
  apiKey: string | null;

  @Column({ type: 'timestamp without time zone', nullable: true, transformer: new MomentValueTransformer() })
  apiKeyLastUpdated: Moment | null;

  @Column({ type: 'text', nullable: true })
  emailVerificationToken: string | null;

  @Column({
    type: 'timestamp without time zone',
    nullable: true,
    transformer: new MomentValueTransformer(),
  })
  emailVerificationTokenExpires?: Moment | null;

  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ type: 'text', nullable: true })
  resetPasswordToken: string | null;

  @Column({
    type: 'timestamp without time zone',
    nullable: true,
    transformer: new MomentValueTransformer(),
  })
  resetPasswordTokenExpires: Moment | null;
}

export const AUTH_ENTITIES = [
  Credentials,
]
