import {MigrationInterface, QueryRunner} from "typeorm";

export class MolecularDBAddColumns1639664100425 implements MigrationInterface {
    name = 'MolecularDBAddColumns1639664100425'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ADD "user_id" uuid`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ADD "input_path" text`);
        await queryRunner.query(`COMMENT ON COLUMN "public"."dataset_diagnostic"."updated_dt" IS NULL`);
        // await queryRunner.query(`ALTER TABLE "public"."dataset_diagnostic" ALTER COLUMN "updated_dt" SET DEFAULT (now() at time zone 'utc')`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ADD CONSTRAINT "FK_8b8177fd2c25bee10f19af2591c" FOREIGN KEY ("user_id") REFERENCES "graphql"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" DROP CONSTRAINT "FK_8b8177fd2c25bee10f19af2591c"`);
        // await queryRunner.query(`ALTER TABLE "public"."dataset_diagnostic" ALTER COLUMN "updated_dt" SET DEFAULT timezone('utc'`);
        await queryRunner.query(`COMMENT ON COLUMN "public"."dataset_diagnostic"."updated_dt" IS NULL`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" DROP COLUMN "input_path"`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" DROP COLUMN "user_id"`);
    }

}
