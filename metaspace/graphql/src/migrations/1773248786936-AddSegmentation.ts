import {MigrationInterface, QueryRunner} from "typeorm";

export class AddSegmentation1773248786936 implements MigrationInterface {
    name = 'AddSegmentation1773248786936'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "public"."image_segmentation_job" ("id" BIGSERIAL NOT NULL, "ds_id" text NOT NULL, "status" text NOT NULL, "error" text, "created_at" TIMESTAMP NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(), CONSTRAINT "PK_02b755530fe45b2070cf66f93b7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "image_segmentation_job_ds_id_index" ON "public"."image_segmentation_job" ("ds_id") `);
        await queryRunner.query(`CREATE INDEX "image_segmentation_job_status_index" ON "public"."image_segmentation_job" ("status") `);
        await queryRunner.query(`CREATE INDEX "image_segmentation_job_ds_id_status_index" ON "public"."image_segmentation_job" ("ds_id", "status") `);
        await queryRunner.query(`CREATE TABLE "public"."segmentation" ("id" uuid NOT NULL DEFAULT uuid_generate_v1mc(), "dataset_id" text NOT NULL, "job_id" bigint, "segment_index" integer NOT NULL, "algorithm" text NOT NULL, "status" text NOT NULL, "error" text, "created_at" TIMESTAMP NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(), CONSTRAINT "PK_4bc2a01449d339b58b557792a86" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "segmentation_dataset_id_index" ON "public"."segmentation" ("dataset_id") `);
        await queryRunner.query(`CREATE INDEX "segmentation_dataset_id_status_index" ON "public"."segmentation" ("dataset_id", "status") `);
        await queryRunner.query(`CREATE INDEX "segmentation_dataset_id_algorithm_index" ON "public"."segmentation" ("dataset_id", "algorithm") `);
        await queryRunner.query(`CREATE TABLE "public"."segmentation_ion_profile" ("id" BIGSERIAL NOT NULL, "segmentation_id" uuid NOT NULL, "annotation_id" integer NOT NULL, "enrich_score" real NOT NULL, CONSTRAINT "UQ_segmentation_ion_profile" UNIQUE ("segmentation_id", "annotation_id"), CONSTRAINT "PK_2d0f64828235aa002b67dc4928d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "segmentation_ion_profile_segmentation_id_index" ON "public"."segmentation_ion_profile" ("segmentation_id") `);
        await queryRunner.query(`CREATE INDEX "segmentation_ion_profile_annotation_id_index" ON "public"."segmentation_ion_profile" ("annotation_id") `);
        await queryRunner.query(`CREATE INDEX "segmentation_ion_profile_segmentation_id_enrich_score_index" ON "public"."segmentation_ion_profile" ("segmentation_id", "enrich_score") `);
        await queryRunner.query(`ALTER TABLE "public"."image_segmentation_job" ADD CONSTRAINT "FK_5bcd68b2b4aca24cc5edfc9daeb" FOREIGN KEY ("ds_id") REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."segmentation" ADD CONSTRAINT "FK_1edf03796c0b5d6c554a33de50f" FOREIGN KEY ("dataset_id") REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."segmentation" ADD CONSTRAINT "FK_0c6a7c2a1459e2678ed1702496c" FOREIGN KEY ("job_id") REFERENCES "public"."image_segmentation_job"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."segmentation_ion_profile" ADD CONSTRAINT "FK_dc8d93ce0234e49a86b7c4547e5" FOREIGN KEY ("segmentation_id") REFERENCES "public"."segmentation"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."segmentation_ion_profile" ADD CONSTRAINT "FK_1fa2c4eb5941c1fd8057ab00c36" FOREIGN KEY ("annotation_id") REFERENCES "public"."annotation"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."segmentation_ion_profile" DROP CONSTRAINT "FK_1fa2c4eb5941c1fd8057ab00c36"`);
        await queryRunner.query(`ALTER TABLE "public"."segmentation_ion_profile" DROP CONSTRAINT "FK_dc8d93ce0234e49a86b7c4547e5"`);
        await queryRunner.query(`ALTER TABLE "public"."segmentation" DROP CONSTRAINT "FK_0c6a7c2a1459e2678ed1702496c"`);
        await queryRunner.query(`ALTER TABLE "public"."segmentation" DROP CONSTRAINT "FK_1edf03796c0b5d6c554a33de50f"`);
        await queryRunner.query(`ALTER TABLE "public"."image_segmentation_job" DROP CONSTRAINT "FK_5bcd68b2b4aca24cc5edfc9daeb"`);
        await queryRunner.query(`DROP INDEX "public"."segmentation_ion_profile_segmentation_id_enrich_score_index"`);
        await queryRunner.query(`DROP INDEX "public"."segmentation_ion_profile_annotation_id_index"`);
        await queryRunner.query(`DROP INDEX "public"."segmentation_ion_profile_segmentation_id_index"`);
        await queryRunner.query(`DROP TABLE "public"."segmentation_ion_profile"`);
        await queryRunner.query(`DROP INDEX "public"."segmentation_dataset_id_algorithm_index"`);
        await queryRunner.query(`DROP INDEX "public"."segmentation_dataset_id_status_index"`);
        await queryRunner.query(`DROP INDEX "public"."segmentation_dataset_id_index"`);
        await queryRunner.query(`DROP TABLE "public"."segmentation"`);
        await queryRunner.query(`DROP INDEX "public"."image_segmentation_job_ds_id_status_index"`);
        await queryRunner.query(`DROP INDEX "public"."image_segmentation_job_status_index"`);
        await queryRunner.query(`DROP INDEX "public"."image_segmentation_job_ds_id_index"`);
        await queryRunner.query(`DROP TABLE "public"."image_segmentation_job"`);
    }

}
