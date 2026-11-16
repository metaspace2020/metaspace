import {MigrationInterface, QueryRunner} from "typeorm";

export class AddDatasetMetadataV21789396493604 implements MigrationInterface {
    name = 'AddDatasetMetadataV21789396493604'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."dataset" ADD "metadata_v2" json`);
        await queryRunner.query(`CREATE INDEX "dataset_metadata_v2_schema_version_index" ON "public"."dataset" ((("metadata_v2"->'document'->>'schema_version')))`);

        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
        await queryRunner.query(`CREATE TABLE "public"."ontology_term" ("curie" text NOT NULL, "subtree" text NOT NULL, "label" text NOT NULL, "synonyms" text array NOT NULL DEFAULT '{}'::text[], "ontology" text NOT NULL, "obsolete" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_0b7180641535673df751a19f104" PRIMARY KEY ("curie", "subtree"))`);
        await queryRunner.query(`CREATE INDEX "ontology_term_subtree_index" ON "public"."ontology_term" ("subtree") `);
        await queryRunner.query(`CREATE INDEX "ontology_term_label_trgm_index" ON "public"."ontology_term" USING gin ("label" gin_trgm_ops)`);
        // Synonyms are matched as one text blob so the OR in ontologyTermSuggestions can use two index
        // scans instead of a sequential scan. array_to_string is not IMMUTABLE, hence the wrapper.
        await queryRunner.query(`CREATE FUNCTION "public"."ontology_term_synonym_text"(text[]) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT array_to_string($1, ' ') $$`);
        await queryRunner.query(`CREATE INDEX "ontology_term_synonyms_trgm_index" ON "public"."ontology_term" USING gin ("public"."ontology_term_synonym_text"("synonyms") gin_trgm_ops)`);
        // Prefix matches ("homo s" -> "Homo sapiens") are served from this btree before any trigram
        // search runs, which keeps the common case cheap on multi-million-row subtrees (NCBITaxon).
        await queryRunner.query(`CREATE INDEX "ontology_term_label_prefix_index" ON "public"."ontology_term" ("subtree", lower("label") text_pattern_ops) WHERE "obsolete" = false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."ontology_term_label_prefix_index"`);
        await queryRunner.query(`DROP INDEX "public"."ontology_term_synonyms_trgm_index"`);
        await queryRunner.query(`DROP FUNCTION "public"."ontology_term_synonym_text"(text[])`);
        await queryRunner.query(`DROP INDEX "public"."ontology_term_label_trgm_index"`);
        await queryRunner.query(`DROP INDEX "public"."ontology_term_subtree_index"`);
        await queryRunner.query(`DROP TABLE "public"."ontology_term"`);
        // pg_trgm is left installed: dropping an extension is a cluster-wide change.

        await queryRunner.query(`DROP INDEX "public"."dataset_metadata_v2_schema_version_index"`);
        await queryRunner.query(`ALTER TABLE "public"."dataset" DROP COLUMN "metadata_v2"`);
    }

}
