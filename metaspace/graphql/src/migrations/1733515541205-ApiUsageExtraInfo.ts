import { MigrationInterface, QueryRunner } from "typeorm";

export class ApiUsageExtraInfo1733515541205 implements MigrationInterface {
    name = 'ApiUsageExtraInfo1733515541205'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add columns to the "user" table
        await queryRunner.query(`ALTER TABLE "graphql"."user" ADD "created_at" TIMESTAMP DEFAULT NOW()`);
        await queryRunner.query(`ALTER TABLE "graphql"."user" ADD "updated_at" TIMESTAMP DEFAULT NOW()`);

        // Add columns to the "api_usage" table
        await queryRunner.query(`ALTER TABLE "public"."api_usage" ADD "ip_hash" TEXT`);
        await queryRunner.query(`ALTER TABLE "public"."api_usage" ADD "device_info" json`);

        // Add indexes to the "api_usage" table
        await queryRunner.query(`CREATE INDEX "IDX_api_usage_ip_hash" ON "public"."api_usage" ("ip_hash")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes from the "api_usage" table
        await queryRunner.query(`DROP INDEX "public"."IDX_api_usage_ip_hash"`);

        // Remove columns from the "api_usage" table
        await queryRunner.query(`ALTER TABLE "public"."api_usage" DROP COLUMN "device_info"`);
        await queryRunner.query(`ALTER TABLE "public"."api_usage" DROP COLUMN "ip_hash"`);

        // Remove columns from the "user" table
        await queryRunner.query(`ALTER TABLE "graphql"."user" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "graphql"."user" DROP COLUMN "created_at"`);
    }
}
