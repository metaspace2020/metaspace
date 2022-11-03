import {MigrationInterface, QueryRunner} from "typeorm";

export class SizeHash1667433292010 implements MigrationInterface {
    name = 'SizeHash1667433292010'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."dataset" ADD "size_hash" json`);

        // await queryRunner.query(`COMMENT ON COLUMN "public"."dataset_diagnostic"."updated_dt" IS NULL`);
        // await queryRunner.query(`ALTER TABLE "public"."dataset_diagnostic" ALTER COLUMN "updated_dt" SET DEFAULT (now() at time zone 'utc')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."dataset" DROP COLUMN "size_hash"`);

        // await queryRunner.query(`ALTER TABLE "public"."dataset_diagnostic" ALTER COLUMN "updated_dt" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`COMMENT ON COLUMN "public"."dataset_diagnostic"."updated_dt" IS NULL`);
    }

}
