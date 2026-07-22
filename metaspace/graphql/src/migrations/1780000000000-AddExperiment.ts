import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddExperiment1780000000000 implements MigrationInterface {
  name = 'AddExperiment1780000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "public"."experiment" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v1mc(),
      "project_id" uuid NOT NULL,
      "created_by" uuid NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "match_mode" text NOT NULL,
      "label_groups" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "run_status" text,
      "run_stage" text,
      "run_filters" jsonb,
      "run_excluded_samples" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "run_inferred_test" text,
      "run_error" text,
      "run_started_at" TIMESTAMP,
      "run_finished_at" TIMESTAMP,
      "run_generation" integer NOT NULL DEFAULT 0,
      "run_qc" jsonb,
      "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT "CHK_experiment_match_mode"
        CHECK ("match_mode" IN ('name','manual')),
      CONSTRAINT "CHK_experiment_run_status"
        CHECK ("run_status" IS NULL OR "run_status" IN ('QUEUED','PREPARING','RUNNING','RUNNING_STATS','FINISHED','FAILED')),
      CONSTRAINT "CHK_experiment_run_stage"
        CHECK ("run_stage" IS NULL OR "run_stage" IN ('PREP','TEST','STATS','DONE')),
      CONSTRAINT "PK_experiment" PRIMARY KEY ("id"))`)
    await queryRunner.query(
      `CREATE INDEX "experiment_project_id_index" ON "public"."experiment" ("project_id")`
    )
    await queryRunner.query(
      `CREATE INDEX "experiment_created_by_index" ON "public"."experiment" ("created_by")`
    )

    await queryRunner.query(`CREATE TABLE "public"."experiment_dataset" (
      "id" BIGSERIAL NOT NULL,
      "experiment_id" uuid NOT NULL,
      "dataset_id" text NOT NULL,
      "region_source" text NOT NULL,
      "regions" jsonb NOT NULL DEFAULT '[]'::jsonb,
      CONSTRAINT "CHK_experiment_dataset_region_source"
        CHECK ("region_source" IN ('roi','segmentation','whole')),
      CONSTRAINT "UQ_experiment_dataset" UNIQUE ("experiment_id", "dataset_id"),
      CONSTRAINT "PK_experiment_dataset" PRIMARY KEY ("id"))`)
    await queryRunner.query(
      `CREATE INDEX "experiment_dataset_dataset_id_index" ON "public"."experiment_dataset" ("dataset_id")`
    )

    await queryRunner.query(`CREATE TABLE "public"."experiment_result" (
      "id" BIGSERIAL NOT NULL,
      "experiment_id" uuid NOT NULL,
      "run_generation" integer NOT NULL,
      "ion_id" integer NOT NULL,
      "label_group_name" text NOT NULL,
      "cond_a" text,
      "cond_b" text,
      "lfc" real,
      "p_value" real,
      "fdr" real,
      "n_a" integer,
      "n_b" integer,
      "mean_a" real,
      "mean_b" real,
      "detection_rate_a" real,
      "detection_rate_b" real,
      CONSTRAINT "PK_experiment_result" PRIMARY KEY ("id"))`)

    await queryRunner.query(
      `CREATE INDEX "experiment_result_omnibus_fdr_index"
        ON "public"."experiment_result"
          ("experiment_id", "run_generation", "label_group_name", "fdr")
        WHERE "cond_a" IS NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "experiment_result_pair_fdr_index"
        ON "public"."experiment_result"
          ("experiment_id", "run_generation", "label_group_name",
           "cond_a", "cond_b", "fdr")
        WHERE "cond_a" IS NOT NULL`
    )
    await queryRunner.query(
      `CREATE INDEX "experiment_result_ion_id_index"
        ON "public"."experiment_result" ("ion_id")`
    )

    await queryRunner.query(
      `ALTER TABLE "public"."experiment" ADD CONSTRAINT "FK_experiment_project"
        FOREIGN KEY ("project_id") REFERENCES "graphql"."project"("id") ON DELETE CASCADE`
    )
    await queryRunner.query(
      `ALTER TABLE "public"."experiment_dataset" ADD CONSTRAINT "FK_experiment_dataset_experiment"
        FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE CASCADE`
    )
    await queryRunner.query(
      `ALTER TABLE "public"."experiment_dataset" ADD CONSTRAINT "FK_experiment_dataset_dataset"
        FOREIGN KEY ("dataset_id") REFERENCES "public"."dataset"("id") ON DELETE CASCADE`
    )
    await queryRunner.query(
      `ALTER TABLE "public"."experiment_result" ADD CONSTRAINT "FK_experiment_result_experiment"
        FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE CASCADE`
    )
    await queryRunner.query(
      `ALTER TABLE "public"."experiment_result" ADD CONSTRAINT "FK_experiment_result_ion"
        FOREIGN KEY ("ion_id") REFERENCES "graphql"."ion"("id") ON DELETE RESTRICT`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "public"."experiment_result"`)
    await queryRunner.query(`DROP TABLE "public"."experiment_dataset"`)
    await queryRunner.query(`DROP TABLE "public"."experiment"`)
  }
}
