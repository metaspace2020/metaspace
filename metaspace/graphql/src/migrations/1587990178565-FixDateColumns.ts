import {MigrationInterface, QueryRunner} from "typeorm";

export class FixDateColumns1587990178565 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        try {
            await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" DROP DEFAULT`);
            await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" DROP DEFAULT`);
            await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" DROP DEFAULT`);
            await queryRunner.query(`ALTER TABLE "public"."dataset" ALTER COLUMN "status_update_dt" DROP DEFAULT`);
            // Old project.created_dt values were stored as UTC, convert them to the local timezone
            const oldTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            await queryRunner.query(`UPDATE graphql.project SET created_dt = (created_dt AT TIME ZONE 'utc') AT TIME ZONE '${oldTz}'`);
        } catch (ex) {
            console.error(ex)
            throw ex;
        }
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."dataset" ALTER COLUMN "status_update_dt" SET DEFAULT (now() at time zone 'utc')`);
        await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT (now() at time zone 'utc')`);
        await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT (now() at time zone 'utc')`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT (now() at time zone 'utc')`);
        const oldTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        await queryRunner.query(`UPDATE graphql.project SET created_dt = (created_dt AT TIME ZONE '${oldTz}') AT TIME ZONE 'utc'`);
    }

}
