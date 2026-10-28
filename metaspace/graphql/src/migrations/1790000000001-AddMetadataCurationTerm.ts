import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMetadataCurationTerm1790000000001 implements MigrationInterface {
    name = 'AddMetadataCurationTerm1790000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "public"."metadata_curation_term" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "slot" text NOT NULL,
            "normalized_text" text NOT NULL,
            "text" text NOT NULL,
            "status" text NOT NULL DEFAULT 'pending',
            "canonical_label" text,
            "ontology_id" text,
            "aliases" text array NOT NULL DEFAULT '{}',
            "suggested_ontology_id" text,
            "suggested_label" text,
            "suggested_score" real,
            "note" text,
            "dataset_id" text NOT NULL,
            "submitter_id" uuid,
            "created_at" timestamptz NOT NULL DEFAULT now(),
            "decided_by_id" uuid,
            "decided_at" timestamptz,
            "apply_state" text NOT NULL DEFAULT 'idle',
            "applied_count" integer NOT NULL DEFAULT 0,
            CONSTRAINT "PK_metadata_curation_term" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_metadata_curation_term_slot_dataset" UNIQUE ("slot", "dataset_id"),
            CONSTRAINT "FK_metadata_curation_term_dataset" FOREIGN KEY ("dataset_id") REFERENCES "graphql"."dataset"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_metadata_curation_term_submitter" FOREIGN KEY ("submitter_id") REFERENCES "graphql"."user"("id") ON DELETE SET NULL,
            CONSTRAINT "FK_metadata_curation_term_decided_by" FOREIGN KEY ("decided_by_id") REFERENCES "graphql"."user"("id") ON DELETE SET NULL
        )`);
        await queryRunner.query(`CREATE INDEX "metadata_curation_term_slot_status_index" ON "public"."metadata_curation_term" ("slot", "status")`);
        await queryRunner.query(`CREATE INDEX "metadata_curation_term_slot_normalized_text_index" ON "public"."metadata_curation_term" ("slot", "normalized_text")`);
        await queryRunner.query(`CREATE INDEX "metadata_curation_term_dataset_id_index" ON "public"."metadata_curation_term" ("dataset_id")`);
        await queryRunner.query(`CREATE INDEX "metadata_curation_term_normalized_text_trgm_index" ON "public"."metadata_curation_term" USING gin ("normalized_text" gin_trgm_ops)`);
        await queryRunner.query(`CREATE INDEX "metadata_curation_term_aliases_index" ON "public"."metadata_curation_term" USING gin ("aliases")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."metadata_curation_term_aliases_index"`);
        await queryRunner.query(`DROP INDEX "public"."metadata_curation_term_normalized_text_trgm_index"`);
        await queryRunner.query(`DROP INDEX "public"."metadata_curation_term_dataset_id_index"`);
        await queryRunner.query(`DROP INDEX "public"."metadata_curation_term_slot_normalized_text_index"`);
        await queryRunner.query(`DROP INDEX "public"."metadata_curation_term_slot_status_index"`);
        await queryRunner.query(`DROP TABLE "public"."metadata_curation_term"`);
    }

}
