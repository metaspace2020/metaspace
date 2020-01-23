import {Column, Entity, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn} from "typeorm";


@Entity({ schema: 'public', name: 'molecular_db' })
export class MolecularDB {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  version: string;

  @OneToMany(type => Molecule, molecule => molecule.moldb)
  molecules: Molecule[];

}

@Entity({ schema: 'public' })
export class Molecule {

    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text' })
    mol_id: string;

    @Column({ type: 'text' })
    mol_name: string;

    @Column({ type: 'text' })
    formula: string;

    @ManyToOne(type => MolecularDB)
    moldb: MolecularDB;
}

export const MOLECULAR_DB_ENTITIES = [
  MolecularDB,
  Molecule,
];