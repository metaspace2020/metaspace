import {MigrationInterface, QueryRunner} from "typeorm";

export class AddDatasetMetadataV21789396493604 implements MigrationInterface {
    name = 'AddDatasetMetadataV21789396493604'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."dataset" ADD "metadata_v2" json`);
        await queryRunner.query(`CREATE INDEX "dataset_metadata_v2_schema_version_index" ON "public"."dataset" ((("metadata_v2"->>'schema_version')))`);

        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
        await queryRunner.query(`CREATE TABLE "public"."ontology_term" ("curie" text NOT NULL, "subtree" text NOT NULL, "label" text NOT NULL, "synonyms" text array NOT NULL DEFAULT '{}'::text[], "ontology" text NOT NULL, "obsolete" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_0b7180641535673df751a19f104" PRIMARY KEY ("curie", "subtree"))`);
        await queryRunner.query(`CREATE INDEX "ontology_term_subtree_index" ON "public"."ontology_term" ("subtree") `);
        await queryRunner.query(`CREATE INDEX "ontology_term_label_trgm_index" ON "public"."ontology_term" USING gin ("label" gin_trgm_ops)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."ontology_term_label_trgm_index"`);
        await queryRunner.query(`DROP INDEX "public"."ontology_term_subtree_index"`);
        await queryRunner.query(`DROP TABLE "public"."ontology_term"`);
        // Deliberately not dropping the pg_trgm extension itself - other features may come to
        // depend on it, a much larger blast radius than this one table.

        await queryRunner.query(`DROP INDEX "public"."dataset_metadata_v2_schema_version_index"`);
        await queryRunner.query(`ALTER TABLE "public"."dataset" DROP COLUMN "metadata_v2"`);
    }

}
