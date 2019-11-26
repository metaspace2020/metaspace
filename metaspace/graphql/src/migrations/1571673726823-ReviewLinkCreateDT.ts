import {MigrationInterface, QueryRunner} from "typeorm";

export class ReviewLinkCreateDT1571673726823 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "graphql"."project" ADD "review_token_created_dt" TIMESTAMP DEFAULT null`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ADD "publish_notifications_sent" integer NOT NULL DEFAULT 0`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT (now() at time zone 'utc')`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT timezone('utc'`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" DROP COLUMN "publish_notifications_sent"`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" DROP COLUMN "review_token_created_dt"`);
    }

}
