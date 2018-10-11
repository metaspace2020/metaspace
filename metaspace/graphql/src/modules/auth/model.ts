import 'reflect-metadata';
import {Entity, PrimaryColumn, Column, ColumnType} from 'typeorm';
import {Moment} from 'moment';
import {ValueTransformer} from 'typeorm/decorator/options/ValueTransformer';
import * as moment from 'moment';

class MomentValueTransformer implements ValueTransformer {
  to (value: Moment): Date| null {
    return value ? value.toDate(): null;
  }

  from (value: Date| null): Moment| null {
    return value ? moment.utc(value) : null;
  }
}

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
