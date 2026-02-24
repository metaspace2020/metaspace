import {MigrationInterface, QueryRunner} from "typeorm";

export class AddDiffRoi1770128239267 implements MigrationInterface {
    name = 'AddDiffRoi1770128239267'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create roi table
        await queryRunner.query(`CREATE TABLE "public"."roi" ("id" bigserial NOT NULL, "dataset_id" text NOT NULL, "user_id" uuid NOT NULL, "name" text NOT NULL, "is_default" boolean NOT NULL DEFAULT false, "geojson" jsonb NOT NULL, CONSTRAINT "PK_roi_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "roi_dataset_id_index" ON "public"."roi" ("dataset_id") `);
        await queryRunner.query(`CREATE INDEX "roi_user_id_index" ON "public"."roi" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "roi_dataset_user_index" ON "public"."roi" ("dataset_id", "user_id") `);
        await queryRunner.query(`CREATE INDEX "roi_dataset_default_index" ON "public"."roi" ("dataset_id", "is_default") `);
        
        // Create diff_roi table
        await queryRunner.query(`CREATE TABLE "public"."diff_roi" ("id" bigserial NOT NULL, "annotation_id" integer NOT NULL, "roi_id" bigint NOT NULL, "lfc" real NOT NULL, "auc" real NOT NULL, CONSTRAINT "diff_roi_annotation_roi_uindex" UNIQUE ("annotation_id", "roi_id"), CONSTRAINT "PK_diff_roi_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "diff_roi_annot_id_index" ON "public"."diff_roi" ("annotation_id") `);
        await queryRunner.query(`CREATE INDEX "diff_roi_roi_id_index" ON "public"."diff_roi" ("roi_id") `);
        await queryRunner.query(`CREATE INDEX "diff_roi_auc_index" ON "public"."diff_roi" ("auc") `);
        await queryRunner.query(`CREATE INDEX "diff_roi_lfc_index" ON "public"."diff_roi" ("lfc") `);
        
        // Add foreign key constraints
        await queryRunner.query(`ALTER TABLE "public"."roi" ADD CONSTRAINT "FK_roi_dataset" FOREIGN KEY ("dataset_id") REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."roi" ADD CONSTRAINT "FK_roi_user" FOREIGN KEY ("user_id") REFERENCES "graphql"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" ADD CONSTRAINT "FK_diff_roi_annotation" FOREIGN KEY ("annotation_id") REFERENCES "public"."annotation"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" ADD CONSTRAINT "FK_diff_roi_roi" FOREIGN KEY ("roi_id") REFERENCES "public"."roi"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraints
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" DROP CONSTRAINT "FK_diff_roi_roi"`);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" DROP CONSTRAINT "FK_diff_roi_annotation"`);
        await queryRunner.query(`ALTER TABLE "public"."roi" DROP CONSTRAINT "FK_roi_user"`);
        await queryRunner.query(`ALTER TABLE "public"."roi" DROP CONSTRAINT "FK_roi_dataset"`);
        
        // Drop indexes and tables
        await queryRunner.query(`DROP INDEX "public"."diff_roi_lfc_index"`);
        await queryRunner.query(`DROP INDEX "public"."diff_roi_auc_index"`);
        await queryRunner.query(`DROP INDEX "public"."diff_roi_roi_id_index"`);
        await queryRunner.query(`DROP INDEX "public"."diff_roi_annot_id_index"`);
        await queryRunner.query(`DROP TABLE "public"."diff_roi"`);
        
        await queryRunner.query(`DROP INDEX "public"."roi_dataset_default_index"`);
        await queryRunner.query(`DROP INDEX "public"."roi_dataset_user_index"`);
        await queryRunner.query(`DROP INDEX "public"."roi_user_id_index"`);
        await queryRunner.query(`DROP INDEX "public"."roi_dataset_id_index"`);
        await queryRunner.query(`DROP TABLE "public"."roi"`);
    }

}