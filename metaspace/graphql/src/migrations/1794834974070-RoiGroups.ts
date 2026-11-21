import {MigrationInterface, QueryRunner} from "typeorm";

export class RoiGroups1794834974070 implements MigrationInterface {
    name = 'RoiGroups1794834974070'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."roi" ADD "group_label" text`);
        await queryRunner.query(`ALTER TABLE "public"."roi" ADD "include_in_diff" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" ADD "group_label" text`);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" ADD "reference_label" text`);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" ADD "roi_lfc" real`);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" ADD "comparison_roi_ids" bigint array`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" DROP COLUMN "comparison_roi_ids"`);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" DROP COLUMN "roi_lfc"`);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" DROP COLUMN "reference_label"`);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" DROP COLUMN "group_label"`);
        await queryRunner.query(`ALTER TABLE "public"."roi" DROP COLUMN "include_in_diff"`);
        await queryRunner.query(`ALTER TABLE "public"."roi" DROP COLUMN "group_label"`);
    }

}
