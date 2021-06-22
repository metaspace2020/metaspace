import {MigrationInterface, QueryRunner} from "typeorm";

export class OpticalImageUrl1615409900515 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."dataset" ADD "thumbnail_url" text`);
        await queryRunner.query(`ALTER TABLE "public"."dataset" ADD "ion_thumbnail_url" text`);
        await queryRunner.query(`ALTER TABLE "public"."optical_image" ADD "url" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."optical_image" DROP COLUMN "url"`);
        await queryRunner.query(`ALTER TABLE "public"."dataset" DROP COLUMN "ion_thumbnail_url"`);
        await queryRunner.query(`ALTER TABLE "public"."dataset" DROP COLUMN "thumbnail_url"`);
    }

}
