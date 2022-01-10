import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm'
import { Group } from '../group/model'
import { MomentValueTransformer } from '../../utils/MomentValueTransformer'
import { Moment } from 'moment'
import { User } from '../user/model'

@Entity({ schema: 'public', name: 'molecular_db' })
@Unique('molecular_db_uindex', ['groupId', 'name', 'version'])
export class MolecularDB {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  version: string;

  @Column({
    type: 'timestamp without time zone', transformer: new MomentValueTransformer(),
  })
  createdDT: Moment;

  @Column({ type: 'text', nullable: true })
  moleculeLinkTemplate: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  fullName: string | null;

  @Column({ type: 'text', nullable: true })
  link: string | null;

  @Column({ type: 'text', nullable: true })
  citation: string | null;

  @OneToMany(() => Molecule, molecule => molecule.molecularDB)
  molecules: Molecule[];

  @Column({ type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ type: 'boolean', default: false })
  archived: boolean;

  @Column({ type: 'boolean', default: false })
  targeted: boolean; // All the Metaspace provided databases are untargeted

  @Column({ type: 'uuid', nullable: true })
  groupId: string | null;

  @ManyToOne(() => Group, group => group.molecularDBs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'boolean', default: false })
  default: boolean;

  @Column({ type: 'text', nullable: true })
  inputPath: string | null;
}

@Entity({ schema: 'public' })
export class Molecule {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text' })
    molId: string;

    @Column({ type: 'text' })
    molName: string;

    @Column({ type: 'text' })
    formula: string;

    @Column({ type: 'text', nullable: true })
    inchi: string;

    @Index()
    @Column({ type: 'int' })
    moldbId: number;

    @ManyToOne(() => MolecularDB, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'moldb_id' })
    molecularDB: MolecularDB;
}

export const MOLECULAR_DB_ENTITIES = [
  MolecularDB,
  Molecule,
]
