import {MigrationInterface, QueryRunner} from "typeorm";

export class MolecularDbExtraFields1593450658619 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ADD "created_dt" TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc')`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ALTER "created_dt" SET DEFAULT NULL`);

        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ADD "molecule_link_template" text`);
        await queryRunner.query(`
          UPDATE "public"."molecular_db" SET "molecule_link_template" = 'http://www.hmdb.ca/metabolites/'
            WHERE name like 'HMDB%';
          UPDATE "public"."molecular_db" SET "molecule_link_template" = 'http://www.hmdb.ca/metabolites/'
            WHERE name like 'core_metabolome%';
          UPDATE "public"."molecular_db" SET "molecule_link_template" = 'http://www.ebi.ac.uk/chebi/searchId.do?chebiId='
            WHERE name like 'ChEBI%';
          UPDATE "public"."molecular_db" SET "molecule_link_template" = 'http://swisslipids.org/#/entity/'
            WHERE name like 'SwissLipids%';
          UPDATE "public"."molecular_db" SET "molecule_link_template" = 'http://www.lipidmaps.org/data/LMSDRecord.php?LMID='
            WHERE (name like 'LipidMaps%') OR (name like 'LIPID_MAPS%');
          UPDATE "public"."molecular_db" SET "molecule_link_template" = 'http://pseudomonas.umaryland.edu/PAMDB?MetID='
            WHERE name like 'PAMDB%';
          UPDATE "public"."molecular_db" SET "molecule_link_template" = 'http://ecmdb.ca/compounds/'
            WHERE name like 'ECMDB%';
          UPDATE "public"."molecular_db" SET "molecule_link_template" = 'https://gnps.ucsd.edu/ProteoSAFe/gnpslibraryspectrum.jsp?SpectrumID='
            WHERE name like 'GNPS%';
          UPDATE "public"."molecular_db" SET "molecule_link_template" = 'https://www.npatlas.org/joomla/index.php/explore/compounds#npaid=' 
            WHERE name like 'NPA%';
        `);

        await queryRunner.query(`ALTER TABLE "public"."molecular_db" RENAME COLUMN "public" TO "is_public";`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" DROP COLUMN "molecule_link_template"`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" DROP COLUMN "created_dt"`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" RENAME COLUMN "is_public" TO "public";`);
    }

}
