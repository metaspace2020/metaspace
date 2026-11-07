import {MigrationInterface, QueryRunner} from "typeorm";

export class PerUserSegmentationJobs1790000000000 implements MigrationInterface {
    name = 'PerUserSegmentationJobs1790000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "public"."image_segmentation_job"
            ADD COLUMN "user_id" uuid,
            ADD COLUMN "is_default" boolean NOT NULL DEFAULT true,
            ADD COLUMN "result" jsonb,
            ADD COLUMN "label_map_image_id" text,
            ADD COLUMN "label_map_image_url" text
        `);
        await queryRunner.query(`CREATE INDEX "image_segmentation_job_ds_id_user_id_index" ON "public"."image_segmentation_job" ("ds_id", "user_id")`);
        await queryRunner.query(`CREATE INDEX "image_segmentation_job_ds_id_is_default_index" ON "public"."image_segmentation_job" ("ds_id", "is_default")`);
        await queryRunner.query(`ALTER TABLE "public"."image_segmentation_job" ADD CONSTRAINT "FK_60741f31f070f7f18270cfa0b07" FOREIGN KEY ("user_id") REFERENCES "graphql"."user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."segmentation" DROP CONSTRAINT "FK_0c6a7c2a1459e2678ed1702496c"`);
        await queryRunner.query(`ALTER TABLE "public"."segmentation" ADD CONSTRAINT "FK_0c6a7c2a1459e2678ed1702496c" FOREIGN KEY ("job_id") REFERENCES "public"."image_segmentation_job"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."segmentation" DROP CONSTRAINT "FK_0c6a7c2a1459e2678ed1702496c"`);
        await queryRunner.query(`ALTER TABLE "public"."segmentation" ADD CONSTRAINT "FK_0c6a7c2a1459e2678ed1702496c" FOREIGN KEY ("job_id") REFERENCES "public"."image_segmentation_job"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."image_segmentation_job" DROP CONSTRAINT "FK_60741f31f070f7f18270cfa0b07"`);
        await queryRunner.query(`DROP INDEX "public"."image_segmentation_job_ds_id_is_default_index"`);
        await queryRunner.query(`DROP INDEX "public"."image_segmentation_job_ds_id_user_id_index"`);
        await queryRunner.query(`
            ALTER TABLE "public"."image_segmentation_job"
            DROP COLUMN "label_map_image_url",
            DROP COLUMN "label_map_image_id",
            DROP COLUMN "result",
            DROP COLUMN "is_default",
            DROP COLUMN "user_id"
        `);
    }

}
