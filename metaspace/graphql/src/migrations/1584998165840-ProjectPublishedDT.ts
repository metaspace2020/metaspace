import { MigrationInterface, QueryRunner } from "typeorm";

export class reviewLinks1584998165840 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "graphql"."project" ADD "published_dt" TIMESTAMP DEFAULT null`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT (now() at time zone 'utc')`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "project_description" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "project_description" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "review_token_created_dt" SET DEFAULT null`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "public"."dataset" ALTER COLUMN "status_update_dt" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "public"."job" ADD CONSTRAINT "FK_07f17ed55cabe0ef556bc0e0c93" FOREIGN KEY ("moldb_id") REFERENCES "public"."molecular_db"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        // await queryRunner.query(`ALTER TABLE "public"."job" DROP CONSTRAINT "FK_07f17ed55cabe0ef556bc0e0c93"`);
        // await queryRunner.query(`ALTER TABLE "public"."dataset" ALTER COLUMN "status_update_dt" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT timezone('utc'`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "review_token_created_dt" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "project_description" SET DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "project_description" SET NOT NULL`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT timezone('utc'`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" DROP COLUMN "published_dt"`);
    }

}
