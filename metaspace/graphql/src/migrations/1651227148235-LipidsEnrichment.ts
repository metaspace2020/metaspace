import {MigrationInterface, QueryRunner} from "typeorm";

export class LipidsEnrichment1651227148235 implements MigrationInterface {
    name = 'LipidsEnrichment1651227148235'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "public"."enrichment_db" ("id" SERIAL NOT NULL PRIMARY KEY, "name" text NOT NULL UNIQUE)`);
        await queryRunner.query(`CREATE TABLE "public"."enrichment_term" ("id" SERIAL NOT NULL PRIMARY KEY, "enrichment_id" text NOT NULL UNIQUE, "enrichment_name" text NOT NULL, "enrichment_db_id" integer REFERENCES "public"."enrichment_db"("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`CREATE TABLE "public"."enrichment_db_molecule_mapping" ("id" SERIAL NOT NULL PRIMARY KEY, "molecule_enriched_name" text NOT NULL, "formula" text NOT NULL, "enrichment_term_id" integer REFERENCES "public"."enrichment_term"("id") ON DELETE CASCADE ON UPDATE NO ACTION, "molecule_id" integer REFERENCES "public"."molecule"("id") ON DELETE CASCADE ON UPDATE NO ACTION, "molecular_db_id" integer REFERENCES "public"."molecular_db"("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`CREATE INDEX "enrichment_db_molecule_mapping_formula__mod_db_id" ON "public"."enrichment_db_molecule_mapping" ("molecular_db_id", "formula")`);
        await queryRunner.query(`CREATE TABLE "public"."enrichment_bootstrap" ("id" SERIAL NOT NULL PRIMARY KEY, "scenario" integer NOT NULL, "formula_adduct" text NOT NULL, "fdr" numeric(2,2) NOT NULL, "annotation_id" text NOT NULL, "dataset_id" text REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION, "enrichment_db_molecule_mapping_id" integer REFERENCES "public"."enrichment_db_molecule_mapping"("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`CREATE TABLE "public"."dataset_enrichment" ("id" SERIAL NOT NULL PRIMARY KEY, "dataset_id" text REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION, "enrichment_db_id" integer REFERENCES "public"."enrichment_db"("id") ON DELETE CASCADE ON UPDATE NO ACTION, "molecular_db_id" integer REFERENCES "public"."molecular_db"("id") ON DELETE CASCADE ON UPDATE NO ACTION, "processing_dt" TIMESTAMP)`);

    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."enrichment_db_molecule_mapping_formula__mod_db_id"`);
        await queryRunner.query(`DROP TABLE "public"."dataset_enrichment"`);
        await queryRunner.query(`DROP TABLE "public"."enrichment_bootstrap"`);
        await queryRunner.query(`DROP TABLE "public"."enrichment_db_molecule_mapping"`);
        await queryRunner.query(`DROP TABLE "public"."enrichment_term"`);
        await queryRunner.query(`DROP TABLE "public"."enrichment_db"`);
    }

}
