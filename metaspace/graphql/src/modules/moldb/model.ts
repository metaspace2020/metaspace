import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique
} from "typeorm";
import {Group} from "../group/model";


@Entity({ schema: 'public', name: 'molecular_db' })
@Unique('molecular_db_uindex', ['groupId', 'name', 'version'])
export class MolecularDB {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  version: string;

  @Column({ type: 'text', default: null })
  description: string;

  @Column({ type: 'text', default: null })
  fullName: string;

  @Column({ type: 'text', default: null })
  link: string;

  @Column({ type: 'text', default: null })
  citation: string;

  @OneToMany(type => Molecule, molecule => molecule.molecularDB)
  molecules: Molecule[];

  @Column({ type: 'bool', default: false })
  public: Boolean;  // At this point, only the Metaspace provided databases are public

  @Column({ type: 'bool', default: false })
  archived: Boolean;

  @Column({ type: 'bool', default: false })
  targeted: Boolean;  // All the Metaspace provided databases are untargeted

  @Column({ type: 'uuid', default: null })
  groupId: string;

  @ManyToOne(type => Group, group => group.molecularDBs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: Group;
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

    @ManyToOne(type => MolecularDB, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'moldb_id' })
    molecularDB: MolecularDB;
}

export const MOLECULAR_DB_ENTITIES = [
  MolecularDB,
  Molecule,
];