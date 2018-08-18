import 'reflect-metadata';
import {Entity, PrimaryColumn, Column, OneToOne, JoinColumn} from 'typeorm';

import {User} from '../user/model';

@Entity()
export class Credentials {

  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()'})
  UUID?: string;

  @Column({ type: 'text', nullable: true })
  hash?: string | null;

  @Column({ type: 'text', nullable: true })
  googleId?: string | null;

  @Column({ type: 'text', nullable: true })
  emailVerificationToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  emailVerificationTokenExpires?: Date | null;

  @Column({ type: 'boolean', default: false })
  emailVerified?: boolean;

  @Column({ type: 'text', nullable: true })
  resetPasswordToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetPasswordTokenExpires?: Date | null;
}
