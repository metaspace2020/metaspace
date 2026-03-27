import {MigrationInterface, QueryRunner} from "typeorm";

export class AddSegmentName1774591540818 implements MigrationInterface {
    name = 'AddSegmentName1774591540818'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "public"."segmentation" 
            ADD COLUMN "name" text DEFAULT NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "public"."image_segmentation_job" 
            ADD COLUMN "submitter_email" text DEFAULT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "public"."segmentation" 
            DROP COLUMN "name"
        `);

        await queryRunner.query(`
            ALTER TABLE "public"."image_segmentation_job" 
            DROP COLUMN "submitter_email"
        `);
    }

}
