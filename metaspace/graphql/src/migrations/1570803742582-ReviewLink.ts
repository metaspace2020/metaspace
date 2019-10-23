import {MigrationInterface, QueryRunner} from "typeorm";

export class ReviewLink1570803742582 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "graphql"."project" ADD "review_token" text`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ADD "publication_status" text NOT NULL DEFAULT 'UNPUBLISHED'`);
        await queryRunner.query(`ALTER TABLE "graphql"."dataset_project" ADD "publication_status" text NOT NULL DEFAULT 'UNPUBLISHED'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT (now() at time zone 'utc')`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT timezone('utc'`);
        await queryRunner.query(`ALTER TABLE "graphql"."dataset_project" DROP COLUMN "publication_status"`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" DROP COLUMN "publication_status"`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" DROP COLUMN "review_token"`);
    }

}
