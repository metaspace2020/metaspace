import {MigrationInterface, QueryRunner} from "typeorm";

export class OpticalImageTransform1655977710255 implements MigrationInterface {
    name = 'OpticalImageTransform1655977710255'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."dataset" ADD "optical_image_transform" double precision array`);
        await queryRunner.query(`ALTER TABLE "public"."optical_image" ADD "optical_image_transform" double precision array`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."dataset" DROP COLUMN "optical_image_transform"`);
        await queryRunner.query(`ALTER TABLE "public"."optical_image" DROP COLUMN "optical_image_transform"`);
    }


}
