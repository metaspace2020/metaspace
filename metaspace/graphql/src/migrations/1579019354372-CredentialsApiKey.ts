import {MigrationInterface, QueryRunner} from "typeorm";

export class CredentialsApiKey1579019354372 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "graphql"."credentials" ADD "api_key" text`);
        await queryRunner.query(`ALTER TABLE "graphql"."credentials" ADD "api_key_last_updated" TIMESTAMP`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "review_token_created_dt" SET DEFAULT null`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT (now() at time zone 'utc')`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "review_token_created_dt" DROP DEFAULT`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT timezone('utc'`);
        await queryRunner.query(`ALTER TABLE "graphql"."credentials" DROP COLUMN "api_key_last_updated"`);
        await queryRunner.query(`ALTER TABLE "graphql"."credentials" DROP COLUMN "api_key"`);
    }

}
