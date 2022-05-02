import {MigrationInterface, QueryRunner} from "typeorm";

export class LipidsEnrichment1651227148235 implements MigrationInterface {
    name = 'LipidsEnrichment1651227148235'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "public"."enrichment_db" ("id" SERIAL NOT NULL PRIMARY KEY, "name" text NOT NULL UNIQUE)`);
        await queryRunner.query(`CREATE TABLE "public"."enrichment_term" ("id" SERIAL NOT NULL PRIMARY KEY, "enrichment_id" text NOT NULL UNIQUE, "enrichment_name" text NOT NULL, "enrichment_db_id" integer REFERENCES "public"."enrichment_db"("id"))`);
        await queryRunner.query(`CREATE TABLE "public"."enrichment_db_molecule_mapping" ("id" SERIAL NOT NULL PRIMARY KEY, "molecule_enriched_name" text NOT NULL, "enrichment_term_id" integer REFERENCES "public"."enrichment_term"("id"), "molecular_db_id" integer REFERENCES "public"."molecular_db"("id"))`);
        await queryRunner.query(`CREATE TABLE "public"."enrichment_bootstrap" ("id" SERIAL NOT NULL PRIMARY KEY, "scenario" integer NOT NULL, "formula_adduct" text NOT NULL, "fdr" numeric(2,2) NOT NULL, "dataset_id" text REFERENCES "public"."dataset"("id"), "enrichment_db_molecule_mapping_id" integer REFERENCES "public"."enrichment_db_molecule_mapping"("id"))`);

    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "public"."enrichment_bootstrap"`);
        await queryRunner.query(`DROP TABLE "public"."enrichment_db_molecule_mapping"`);
        await queryRunner.query(`DROP TABLE "public"."enrichment_term"`);
        await queryRunner.query(`DROP TABLE "public"."enrichment_db"`);
    }

}
