import {Entity, PrimaryColumn, Column, OneToOne, JoinColumn, OneToMany, ManyToOne} from 'typeorm';
import {Credentials} from '../auth/model';

@Entity()
export class User {

  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v1mc()'})
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text'})
  email: string;

  @Column({ type: 'text', default: 'user'})
  role: string;

  // @Column({ type: 'timestamp', nullable: true })
  // groups: Date | null;
  //
  // @Column({ type: 'boolean', nullable: true })
  // primaryGroup: boolean | null;

  @OneToOne(type => Credentials)
  @JoinColumn({ name: 'credentials_id' })
  credentials: Credentials;

  @OneToMany(type => Dataset, ds => ds.user)
  datasets: Dataset[];
}

@Entity()
export class Dataset {

  @PrimaryColumn({ type: 'text'})
  id: string;

  @ManyToOne(type => User, user => user.datasets)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
