import {MigrationInterface, QueryRunner} from "typeorm";

export class AnnotationIonId1567606202347 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."annotation" ADD "ion_id" integer`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT (now() at time zone 'utc')`);
        await queryRunner.query(`ALTER TABLE "public"."annotation" ADD CONSTRAINT "FK_665acc421d80b12a4738e4a175d" FOREIGN KEY ("ion_id") REFERENCES "graphql"."ion"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."annotation" DROP CONSTRAINT "FK_665acc421d80b12a4738e4a175d"`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT timezone('utc'`);
        await queryRunner.query(`ALTER TABLE "public"."annotation" DROP COLUMN "ion_id"`);
    }

}
