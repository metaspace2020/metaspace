import {DbRow} from '../../utils/db'

export interface DbUser extends DbRow {
  UUID: string
  email: string
  name: string | null
  role: string | null
}

export interface DbUserInput {
  UUID: string
  email: string
  name: string | null
  role: string | null
}

import {Entity, PrimaryColumn, Column, OneToOne, JoinColumn} from 'typeorm';
import {Credentials} from '../auth/model';

@Entity()
export class User {

  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()'})
  UUID?: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text'})
  email: string;

  @Column({ type: 'text', nullable: true })
  role?: string;

  // @Column({ type: 'timestamp', nullable: true })
  // groups: Date | null;
  //
  // @Column({ type: 'boolean', nullable: true })
  // primaryGroup: boolean | null;

  @OneToOne(type => Credentials)
  @JoinColumn()
  credentials: Credentials;
}

