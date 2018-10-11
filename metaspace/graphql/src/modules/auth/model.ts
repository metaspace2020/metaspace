import 'reflect-metadata';
import {Column, Entity, PrimaryColumn} from 'typeorm';
import {Moment} from 'moment';
import {MomentValueTransformer} from '../../utils/MomentValueTransformer';

@Entity()
export class Credentials {

  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()' })
  id: string;

  @Column({ type: 'text', nullable: true })
  hash: string | null;

  @Column({ type: 'text', name: 'google_id', nullable: true })
  googleId: string | null;

  @Column({ type: 'text', name: 'email_verification_token', nullable: true })
  emailVerificationToken: string | null;

  @Column({ type: 'timestamp without time zone', name: 'email_verification_token_expires',
    nullable: true, transformer: new MomentValueTransformer() })
  emailVerificationTokenExpires?: Moment | null;

  @Column({ type: 'boolean', name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ type: 'text', name: 'reset_password_token', nullable: true })
  resetPasswordToken: string | null;

  @Column({ type: 'timestamp without time zone', name: 'reset_password_token_expires',
    nullable: true, transformer: new MomentValueTransformer() })
  resetPasswordTokenExpires: Moment | null;
}
