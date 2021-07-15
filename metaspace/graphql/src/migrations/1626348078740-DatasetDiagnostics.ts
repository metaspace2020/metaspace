import {MigrationInterface, QueryRunner} from "typeorm";

export class DatasetDiagnostics1626348078740 implements MigrationInterface {
    name = 'DatasetDiagnostics1626348078740'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "public"."dataset_diagnostic" ("id" uuid NOT NULL DEFAULT uuid_generate_v1mc(), "type" text NOT NULL, "ds_id" text NOT NULL, "job_id" integer, "updated_dt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'), "data" json, "error" text, "images" json NOT NULL, CONSTRAINT "PK_2ddb635004b2e08782649e0c638" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8064cf8bd1bc774a3d53db893f" ON "public"."dataset_diagnostic" ("ds_id", "type") WHERE job_id IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2e8c4885755304fd125f7c4815" ON "public"."dataset_diagnostic" ("ds_id", "type", "job_id") `);
        await queryRunner.query(`ALTER TABLE "public"."dataset_diagnostic" ADD CONSTRAINT "FK_e13bfa279306d04d020139312d1" FOREIGN KEY ("ds_id") REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."dataset_diagnostic" ADD CONSTRAINT "FK_0216974d86c145e2a08ea291c5d" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."dataset_diagnostic" DROP CONSTRAINT "FK_0216974d86c145e2a08ea291c5d"`);
        await queryRunner.query(`ALTER TABLE "public"."dataset_diagnostic" DROP CONSTRAINT "FK_e13bfa279306d04d020139312d1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2e8c4885755304fd125f7c4815"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8064cf8bd1bc774a3d53db893f"`);
        await queryRunner.query(`DROP TABLE "public"."dataset_diagnostic"`);
    }

}
