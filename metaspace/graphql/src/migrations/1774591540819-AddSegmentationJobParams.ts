import {MigrationInterface, QueryRunner} from "typeorm";

export class AddSegmentationJobParams1774591540819 implements MigrationInterface {
    name = 'AddSegmentationJobParams1774591540819'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "public"."image_segmentation_job" 
            ADD COLUMN "parameters" jsonb DEFAULT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "public"."image_segmentation_job" 
            DROP COLUMN "parameters"
        `);
    }

}